#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly HOST_PROGRAM='/usr/local/libexec/better-budget-host'
readonly DEPLOY_COMMAND='/usr/local/sbin/better-budget-deploy'
readonly SET_URL_COMMAND='/usr/local/sbin/better-budget-set-url'
readonly OWNER_COMMAND='/usr/local/sbin/better-budget-owner'
readonly CONFIG_DIRECTORY='/etc/better-budget'
readonly HOST_CONFIG="${CONFIG_DIRECTORY}/host.conf"
readonly IMAGE_TAG_FILE="${CONFIG_DIRECTORY}/image-tag"
readonly PREVIOUS_IMAGE_TAG_FILE="${CONFIG_DIRECTORY}/previous-image-tag"
readonly SERVICE_NAME='better-budget.service'
readonly CONTAINER_NAME='better-budget'
readonly LOCK_FILE='/run/better-budget-deploy.lock'
readonly HEALTH_FAILURE_FILE='/run/better-budget-liveness-failures'
readonly DOCKER_CONFIG_DIRECTORY='/run/better-budget/docker'
readonly RUNTIME_SECRET_DIRECTORY='/run/better-budget/secrets'
readonly DATABASE_CONTAINER_NAME='better-budget-db'
readonly DATABASE_NETWORK='better-budget'
readonly POSTGRES_ROLE='better_budget'
readonly POSTGRES_DATABASE='better_budget'
readonly DATABASE_DATA_DIRECTORY='/var/lib/better-budget/postgres'
readonly DATABASE_TLS_DIRECTORY='/run/better-budget/postgres-tls'
readonly DATABASE_RUNTIME_UID='70'
readonly OWNER_IMAGE_TAG_PREFIX='owner-'
readonly POSTGRES_IMAGE='postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73'

log() {
    printf '[better-budget-host] %s\n' "$*"
}

fail() {
    printf '[better-budget-host] ERROR: %s\n' "$*" >&2
    exit 1
}

require_root() {
    if [[ ${EUID} -ne 0 ]]; then
        fail 'This command must run as root.'
    fi
}

require_commit_sha() {
    local image_tag=${1:-}

    if [[ ! ${image_tag} =~ ^[0-9a-f]{40}$ ]]; then
        fail 'The image tag must be a full 40-character lowercase Git commit SHA.'
    fi
}

require_https_origin() {
    local origin=${1:-}

    if [[ ! ${origin} =~ ^https://[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9](:[0-9]{1,5})?$ ]]; then
        fail 'The Better Auth URL must be an HTTPS origin without a path, query, or fragment.'
    fi
}

load_host_config() {
    if [[ ! -r ${HOST_CONFIG} ]]; then
        fail "Missing ${HOST_CONFIG}. Run the EC2 bootstrap first."
    fi

    source "${HOST_CONFIG}"

    : "${AWS_REGION:?AWS_REGION is required in ${HOST_CONFIG}}"
    : "${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID is required in ${HOST_CONFIG}}"
    : "${ECR_REPOSITORY:?ECR_REPOSITORY is required in ${HOST_CONFIG}}"
    : "${SECRET_ID:?SECRET_ID is required in ${HOST_CONFIG}}"
    : "${BETTER_AUTH_URL:?BETTER_AUTH_URL is required in ${HOST_CONFIG}}"

    require_https_origin "${BETTER_AUTH_URL}"

    ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr-ecr.${AWS_REGION}.on.aws"
    ECR_IMAGE="${ECR_REGISTRY}/${ECR_REPOSITORY}"
    ECR_API_ENDPOINT="https://ecr.${AWS_REGION}.api.aws"
    SECRETS_ENDPOINT="https://secretsmanager.${AWS_REGION}.amazonaws.com"
    LOGS_ENDPOINT="https://logs.${AWS_REGION}.api.aws"

    export AWS_USE_DUALSTACK_ENDPOINT=true
}

instance_id() {
    local token

    token=$(curl --fail --silent --show-error --max-time 2 \
        --request PUT \
        --header 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
        http://169.254.169.254/latest/api/token) || return 1

    curl --fail --silent --show-error --max-time 2 \
        --header "X-aws-ec2-metadata-token: ${token}" \
        http://169.254.169.254/latest/meta-data/instance-id
}

instance_ipv6() {
    local address
    local token

    token=$(curl --fail --silent --show-error --max-time 2 \
        --request PUT \
        --header 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
        http://169.254.169.254/latest/api/token) ||
        fail 'Unable to read the instance metadata token.'

    address=$(curl --fail --silent --show-error --max-time 2 \
        --header "X-aws-ec2-metadata-token: ${token}" \
        http://169.254.169.254/latest/meta-data/ipv6) ||
        fail 'The instance has no IPv6 address; the database cannot be published.'

    if [[ ! ${address} =~ ^[0-9a-fA-F:]+$ ]]; then
        fail "Instance metadata returned an invalid IPv6 address: ${address}"
    fi

    printf '%s' "${address}"
}

pull_image() {
    local image_tag=$1

    require_commit_sha "${image_tag}"
    install -d -m 0700 "${DOCKER_CONFIG_DIRECTORY}"
    export DOCKER_CONFIG="${DOCKER_CONFIG_DIRECTORY}"

    log "Authenticating to ${ECR_REGISTRY}."
    aws ecr get-login-password \
        --region "${AWS_REGION}" \
        --endpoint-url "${ECR_API_ENDPOINT}" |
        docker login \
            --username AWS \
            --password-stdin \
            "${ECR_REGISTRY}" >/dev/null

    log "Pulling ${ECR_IMAGE}:${image_tag}."
    docker pull "${ECR_IMAGE}:${image_tag}"
}

ensure_image_present() {
    local image_tag=$1

    if ! docker image inspect "${ECR_IMAGE}:${image_tag}" >/dev/null 2>&1; then
        pull_image "${image_tag}"
    fi
}

fetch_application_secrets() {
    local auth_secret
    local database_ssl_ca
    local database_url
    local secret_json

    secret_json=$(aws secretsmanager get-secret-value \
        --secret-id "${SECRET_ID}" \
        --region "${AWS_REGION}" \
        --endpoint-url "${SECRETS_ENDPOINT}" \
        --query SecretString \
        --output text)

    database_url=$(jq --exit-status --raw-output '.database_url' <<<"${secret_json}")
    database_ssl_ca=$(jq --exit-status --raw-output '.database_ssl_ca' <<<"${secret_json}")
    auth_secret=$(jq --exit-status --raw-output '.better_auth_secret' <<<"${secret_json}")
    unset secret_json

    if [[ -z ${database_url} || -z ${database_ssl_ca} || -z ${auth_secret} ]]; then
        fail 'The production secret is missing a required runtime value.'
    fi

    install -d -o 1001 -g 1001 -m 0700 "${RUNTIME_SECRET_DIRECTORY}"
    printf '%s' "${database_url}" >"${RUNTIME_SECRET_DIRECTORY}/database-url"
    printf '%s' "${database_ssl_ca}" >"${RUNTIME_SECRET_DIRECTORY}/database-ssl-ca"
    printf '%s' "${auth_secret}" >"${RUNTIME_SECRET_DIRECTORY}/better-auth-secret"

    tee "${RUNTIME_SECRET_DIRECTORY}/entrypoint.sh" >/dev/null <<'ENTRYPOINT'
#!/bin/sh
set -eu
DATABASE_URL=$(cat /run/better-budget-secrets/database-url)
DATABASE_SSL_CA=$(cat /run/better-budget-secrets/database-ssl-ca)
BETTER_AUTH_SECRET=$(cat /run/better-budget-secrets/better-auth-secret)
export DATABASE_URL DATABASE_SSL_CA BETTER_AUTH_SECRET
exec sh -c 'node scripts/validate-production-environment.mjs && node scripts/migrate-production.mjs && node server.js'
ENTRYPOINT

    chown 1001:1001 "${RUNTIME_SECRET_DIRECTORY}"/*
    chmod 0400 \
        "${RUNTIME_SECRET_DIRECTORY}/database-url" \
        "${RUNTIME_SECRET_DIRECTORY}/database-ssl-ca" \
        "${RUNTIME_SECRET_DIRECTORY}/better-auth-secret"
    chmod 0500 "${RUNTIME_SECRET_DIRECTORY}/entrypoint.sh"

    unset database_url
    unset database_ssl_ca
    unset auth_secret
}

ensure_database_network() {
    if ! docker network inspect "${DATABASE_NETWORK}" >/dev/null 2>&1; then
        log "Creating the ${DATABASE_NETWORK} Docker network."
        docker network create "${DATABASE_NETWORK}" >/dev/null
    fi
}

ensure_database_directories() {
    install -d -o "${DATABASE_RUNTIME_UID}" -g "${DATABASE_RUNTIME_UID}" -m 0700 \
        "${DATABASE_DATA_DIRECTORY}"
}

fetch_database_secrets() {
    local database_password
    local secret_json
    local server_certificate
    local server_key

    secret_json=$(aws secretsmanager get-secret-value \
        --secret-id "${SECRET_ID}" \
        --region "${AWS_REGION}" \
        --endpoint-url "${SECRETS_ENDPOINT}" \
        --query SecretString \
        --output text)

    database_password=$(jq --exit-status --raw-output '.postgres_password' <<<"${secret_json}")
    server_certificate=$(jq --exit-status --raw-output '.postgres_server_cert' <<<"${secret_json}")
    server_key=$(jq --exit-status --raw-output '.postgres_server_key' <<<"${secret_json}")
    unset secret_json

    if [[ -z ${database_password} || -z ${server_certificate} || -z ${server_key} ]]; then
        fail 'The production secret is missing a required database value.'
    fi
    if [[ ${server_certificate} != *'BEGIN CERTIFICATE'* ]]; then
        fail 'postgres_server_cert does not contain a PEM certificate.'
    fi
    if [[ ${server_key} != *'PRIVATE KEY'* ]]; then
        fail 'postgres_server_key does not contain a PEM private key.'
    fi

    install -d -o "${DATABASE_RUNTIME_UID}" -g "${DATABASE_RUNTIME_UID}" -m 0700 \
        "${DATABASE_TLS_DIRECTORY}"
    printf '%s' "${database_password}" >"${DATABASE_TLS_DIRECTORY}/password"
    printf '%s\n' "${server_certificate}" >"${DATABASE_TLS_DIRECTORY}/server.crt"
    printf '%s\n' "${server_key}" >"${DATABASE_TLS_DIRECTORY}/server.key"

    chown "${DATABASE_RUNTIME_UID}:${DATABASE_RUNTIME_UID}" "${DATABASE_TLS_DIRECTORY}"/*
    chmod 0400 "${DATABASE_TLS_DIRECTORY}/password"
    chmod 0644 "${DATABASE_TLS_DIRECTORY}/server.crt"
    chmod 0600 "${DATABASE_TLS_DIRECTORY}/server.key"

    unset database_password
    unset server_certificate
    unset server_key
}

run_database() {
    require_root
    load_host_config

    local host_ipv6
    local log_instance_id

    ensure_database_network
    ensure_database_directories
    fetch_database_secrets

    host_ipv6=$(instance_ipv6)
    log_instance_id=$(instance_id || printf 'unknown-instance')

    docker rm --force "${DATABASE_CONTAINER_NAME}" >/dev/null 2>&1 || true
    log "Starting ${POSTGRES_IMAGE%%@*} published on [${host_ipv6}]:5432."

    exec docker run \
        --name "${DATABASE_CONTAINER_NAME}" \
        --rm \
        --init \
        --network "${DATABASE_NETWORK}" \
        --publish "[${host_ipv6}]:5432:5432" \
        --publish 127.0.0.1:5432:5432 \
        --stop-timeout 30 \
        --memory 448m \
        --memory-swap 1024m \
        --mount "type=bind,source=${DATABASE_DATA_DIRECTORY},target=/var/lib/postgresql/data" \
        --mount "type=bind,source=${DATABASE_TLS_DIRECTORY},target=/run/postgres-tls,readonly" \
        --env "POSTGRES_USER=${POSTGRES_ROLE}" \
        --env "POSTGRES_DB=${POSTGRES_DATABASE}" \
        --env POSTGRES_PASSWORD_FILE=/run/postgres-tls/password \
        --label app=better-budget \
        --label environment=production \
        --log-driver awslogs \
        --log-opt "awslogs-region=${AWS_REGION}" \
        --log-opt 'awslogs-group=/better-budget/production' \
        --log-opt "awslogs-stream=database/${log_instance_id}" \
        "${POSTGRES_IMAGE}" \
        -c ssl=on \
        -c ssl_cert_file=/run/postgres-tls/server.crt \
        -c ssl_key_file=/run/postgres-tls/server.key \
        -c shared_buffers=96MB \
        -c max_connections=20 \
        -c work_mem=4MB \
        -c maintenance_work_mem=32MB \
        -c effective_cache_size=256MB
}

database_is_ready() {
    docker exec "${DATABASE_CONTAINER_NAME}" \
        pg_isready --username "${POSTGRES_ROLE}" --dbname "${POSTGRES_DATABASE}" \
        >/dev/null 2>&1
}

await_database_ready() {
    local attempts=${1:-60}
    local attempt

    for ((attempt = 1; attempt <= attempts; attempt += 1)); do
        if database_is_ready; then
            return 0
        fi

        sleep 2
    done

    return 1
}

run_application() {
    require_root
    load_host_config

    local image_tag
    local log_instance_id

    image_tag=$(<"${IMAGE_TAG_FILE}")
    require_commit_sha "${image_tag}"
    ensure_image_present "${image_tag}"
    ensure_database_network
    fetch_application_secrets

    if ! await_database_ready 60; then
        fail 'The database container did not become ready.'
    fi

    log_instance_id=$(instance_id || printf 'unknown-instance')

    docker rm --force "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    log "Starting ${ECR_IMAGE}:${image_tag}."

    exec docker run \
        --name "${CONTAINER_NAME}" \
        --rm \
        --init \
        --network "${DATABASE_NETWORK}" \
        --publish 80:3000 \
        --stop-timeout 30 \
        --mount "type=bind,source=${RUNTIME_SECRET_DIRECTORY},target=/run/better-budget-secrets,readonly" \
        --entrypoint /run/better-budget-secrets/entrypoint.sh \
        --env DATABASE_KIND=postgres \
        --env DATABASE_POOL_SIZE=3 \
        --env DATABASE_SSL=verify-full \
        --env MIGRATIONS_PRESTART=true \
        --env "BETTER_AUTH_URL=${BETTER_AUTH_URL}" \
        --env AUTH_BYPASS=false \
        --env ALLOW_INSECURE_LOCAL_AUTH=false \
        --label app=better-budget \
        --label environment=production \
        --log-driver awslogs \
        --log-opt "awslogs-region=${AWS_REGION}" \
        --log-opt 'awslogs-group=/better-budget/production' \
        --log-opt "awslogs-stream=application/${log_instance_id}" \
        "${ECR_IMAGE}:${image_tag}"
}

run_owner_bootstrap() {
    require_root
    load_host_config

    local image_tag=${1:-}
    local owner_email
    local owner_password
    local secret_json

    if [[ -z ${image_tag} ]]; then
        image_tag=$(<"${IMAGE_TAG_FILE}")
    fi
    require_commit_sha "${image_tag}"

    if ! await_database_ready 30; then
        fail 'The database container is not ready; start better-budget-db.service first.'
    fi

    local owner_image="${ECR_IMAGE}:${OWNER_IMAGE_TAG_PREFIX}${image_tag}"

    install -d -m 0700 "${DOCKER_CONFIG_DIRECTORY}"
    export DOCKER_CONFIG="${DOCKER_CONFIG_DIRECTORY}"
    log "Authenticating to ${ECR_REGISTRY}."
    aws ecr get-login-password \
        --region "${AWS_REGION}" \
        --endpoint-url "${ECR_API_ENDPOINT}" |
        docker login \
            --username AWS \
            --password-stdin \
            "${ECR_REGISTRY}" >/dev/null

    if ! docker pull "${owner_image}"; then
        fail "No owner-bootstrap image ${owner_image}. Run the deployment workflow with build_owner_image enabled."
    fi

    secret_json=$(aws secretsmanager get-secret-value \
        --secret-id "${SECRET_ID}" \
        --region "${AWS_REGION}" \
        --endpoint-url "${SECRETS_ENDPOINT}" \
        --query SecretString \
        --output text)

    owner_email=$(jq --exit-status --raw-output '.owner_email' <<<"${secret_json}")
    owner_password=$(jq --exit-status --raw-output '.owner_password' <<<"${secret_json}")

    if [[ -z ${owner_email} || -z ${owner_password} ]]; then
        unset secret_json
        fail 'The production secret is missing owner_email or owner_password.'
    fi

    fetch_application_secrets
    unset secret_json

    log "Running owner bootstrap from ${owner_image}."

    docker run \
        --rm \
        --init \
        --network "${DATABASE_NETWORK}" \
        --mount "type=bind,source=${RUNTIME_SECRET_DIRECTORY},target=/run/better-budget-secrets,readonly" \
        --env DATABASE_KIND=postgres \
        --env DATABASE_POOL_SIZE=3 \
        --env DATABASE_SSL=verify-full \
        --env MIGRATIONS_PRESTART=true \
        --env "BETTER_AUTH_URL=${BETTER_AUTH_URL}" \
        --env AUTH_BYPASS=false \
        --env ALLOW_INSECURE_LOCAL_AUTH=false \
        --env "BOOTSTRAP_OWNER_EMAIL=${owner_email}" \
        --env "BOOTSTRAP_OWNER_PASSWORD=${owner_password}" \
        --entrypoint sh \
        "${owner_image}" \
        -c 'DATABASE_URL=$(cat /run/better-budget-secrets/database-url)
DATABASE_SSL_CA=$(cat /run/better-budget-secrets/database-ssl-ca)
BETTER_AUTH_SECRET=$(cat /run/better-budget-secrets/better-auth-secret)
export DATABASE_URL DATABASE_SSL_CA BETTER_AUTH_SECRET
exec npm run db:owner'

    unset owner_email
    unset owner_password
    docker image rm "${owner_image}" >/dev/null 2>&1 || true
}

application_is_healthy() {
    curl --fail --silent --show-error --max-time 5 \
        http://127.0.0.1/api/live >/dev/null &&
        curl --fail --silent --show-error --max-time 5 \
            http://127.0.0.1/api/ready >/dev/null
}

await_application_health() {
    local attempts=${1:-60}
    local attempt

    for ((attempt = 1; attempt <= attempts; attempt += 1)); do
        if application_is_healthy; then
            return 0
        fi

        sleep 5
    done

    return 1
}

write_image_tag() {
    local image_tag=$1
    local temporary_file

    require_commit_sha "${image_tag}"
    temporary_file=$(mktemp "${CONFIG_DIRECTORY}/image-tag.XXXXXX")
    printf '%s\n' "${image_tag}" >"${temporary_file}"
    chmod 0600 "${temporary_file}"
    mv "${temporary_file}" "${IMAGE_TAG_FILE}"
}

remove_unused_images() {
    local current_tag=$1
    local previous_tag=${2:-}
    local repository
    local tag

    while read -r repository tag; do
        [[ -n ${repository} && -n ${tag} ]] || continue
        [[ ${tag} == "${current_tag}" || ${tag} == "${previous_tag}" ]] && continue
        docker image rm "${repository}:${tag}" >/dev/null 2>&1 || true
    done < <(
        docker image ls \
            --format '{{.Repository}} {{.Tag}}' \
            --filter "reference=${ECR_IMAGE}:*"
    )

    docker image prune --force >/dev/null
}

deploy_image() {
    require_root
    load_host_config

    local requested_tag=${1:-}
    local previous_tag

    require_commit_sha "${requested_tag}"
    exec 9>"${LOCK_FILE}"
    if ! flock --nonblock 9; then
        fail 'Another Better Budget deployment is already running.'
    fi

    previous_tag=$(<"${IMAGE_TAG_FILE}")
    require_commit_sha "${previous_tag}"

    pull_image "${requested_tag}"
    write_image_tag "${requested_tag}"
    systemctl restart "${SERVICE_NAME}"

    log "Waiting for liveness and readiness after deploying ${requested_tag}."
    if await_application_health 60; then
        printf '%s\n' "${previous_tag}" >"${PREVIOUS_IMAGE_TAG_FILE}"
        chmod 0600 "${PREVIOUS_IMAGE_TAG_FILE}"
        remove_unused_images "${requested_tag}" "${previous_tag}"
        log "Deployment ${requested_tag} is healthy."
        return 0
    fi

    log "Deployment ${requested_tag} failed; restoring ${previous_tag}."
    write_image_tag "${previous_tag}"
    systemctl restart "${SERVICE_NAME}"

    if await_application_health 60; then
        remove_unused_images "${previous_tag}" ''
        fail "Deployment failed and was rolled back to ${previous_tag}."
    fi

    fail "Deployment failed and rollback ${previous_tag} is not healthy."
}

set_auth_url() {
    require_root
    load_host_config

    local requested_url=${1:-}
    local previous_url=${BETTER_AUTH_URL}
    local backup_file

    exec 9>"${LOCK_FILE}"
    flock --nonblock 9 || fail 'Another host change is already running.'
    require_https_origin "${requested_url}"
    backup_file=$(mktemp "${CONFIG_DIRECTORY}/host.conf.backup.XXXXXX")
    cp --preserve=mode,ownership "${HOST_CONFIG}" "${backup_file}"
    sed -i "s|^BETTER_AUTH_URL=.*$|BETTER_AUTH_URL=${requested_url}|" "${HOST_CONFIG}"

    systemctl restart "${SERVICE_NAME}"
    log "Waiting for health after changing the public origin to ${requested_url}."
    if await_application_health 60; then
        rm -f "${backup_file}"
        log 'The Better Auth origin was updated successfully.'
        return 0
    fi

    log "The new origin failed validation; restoring ${previous_url}."
    mv "${backup_file}" "${HOST_CONFIG}"
    systemctl restart "${SERVICE_NAME}"
    await_application_health 60 || true
    fail 'The Better Auth origin update failed and was rolled back.'
}

check_liveness() {
    require_root

    local failures=0

    exec 8>"${LOCK_FILE}"
    flock --nonblock 8 || return 0
    if curl --fail --silent --show-error --max-time 5 \
        http://127.0.0.1/api/live >/dev/null; then
        printf '0\n' >"${HEALTH_FAILURE_FILE}"
        return 0
    fi

    if [[ -r ${HEALTH_FAILURE_FILE} ]]; then
        failures=$(<"${HEALTH_FAILURE_FILE}")
    fi
    [[ ${failures} =~ ^[0-9]+$ ]] || failures=0
    failures=$((failures + 1))
    printf '%s\n' "${failures}" >"${HEALTH_FAILURE_FILE}"

    if ((failures >= 3)); then
        log 'Liveness failed three times; restarting the application service.'
        printf '0\n' >"${HEALTH_FAILURE_FILE}"
        systemctl restart "${SERVICE_NAME}"
    fi
}

configure_ssm_dual_stack() {
    local config='/etc/amazon/ssm/amazon-ssm-agent.json'
    local template='/etc/amazon/ssm/amazon-ssm-agent.json.template'

    if [[ ! -e ${config} && -e ${template} ]]; then
        cp "${template}" "${config}"
    fi

    if [[ -e ${config} ]]; then
        sed -i \
            's/"UseDualStackEndpoint"[[:space:]]*:[[:space:]]*false/"UseDualStackEndpoint": true/' \
            "${config}"
        systemctl restart amazon-ssm-agent.service
    fi
}

create_swap() {
    local target_bytes=$((2 * 1024 * 1024 * 1024))
    local current_bytes=0

    if [[ -e /swapfile ]]; then
        current_bytes=$(stat --format '%s' /swapfile)
    fi

    if ((current_bytes < target_bytes)); then
        if swapon --show=NAME --noheadings | grep --fixed-strings --quiet /swapfile; then
            swapoff /swapfile
        fi
        rm -f /swapfile
        fallocate --length "${target_bytes}" /swapfile
        chmod 0600 /swapfile
        mkswap /swapfile >/dev/null
    fi

    if ! swapon --show=NAME --noheadings | grep --fixed-strings --quiet /swapfile; then
        swapon /swapfile
    fi

    if ! grep --fixed-strings --quiet '/swapfile none swap defaults 0 0' /etc/fstab; then
        printf '/swapfile none swap defaults 0 0\n' >>/etc/fstab
    fi
}

install_systemd_units() {
    install -d -m 0755 /etc/systemd/system

    tee /etc/systemd/system/better-budget-db.service >/dev/null <<'UNIT'
[Unit]
Description=Better Budget production PostgreSQL container
Wants=network-online.target
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/local/libexec/better-budget-host run-database
ExecStop=-/usr/bin/docker stop --time 30 better-budget-db
Restart=always
RestartSec=5
TimeoutStartSec=0
TimeoutStopSec=45

[Install]
WantedBy=multi-user.target
UNIT

    tee /etc/systemd/system/better-budget.service >/dev/null <<'UNIT'
[Unit]
Description=Better Budget production container
Wants=network-online.target
After=network-online.target docker.service better-budget-db.service
Requires=docker.service better-budget-db.service

[Service]
Type=simple
ExecStart=/usr/local/libexec/better-budget-host run
ExecStop=-/usr/bin/docker stop --time 30 better-budget
Restart=always
RestartSec=5
TimeoutStartSec=0
TimeoutStopSec=45

[Install]
WantedBy=multi-user.target
UNIT

    tee /etc/systemd/system/better-budget-healthcheck.service >/dev/null <<'UNIT'
[Unit]
Description=Check Better Budget process liveness
After=better-budget.service

[Service]
Type=oneshot
ExecStart=/usr/local/libexec/better-budget-host healthcheck
UNIT

    tee /etc/systemd/system/better-budget-healthcheck.timer >/dev/null <<'UNIT'
[Unit]
Description=Run the Better Budget liveness check every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
UNIT

    systemctl daemon-reload
    systemctl enable \
        better-budget-db.service \
        better-budget.service \
        better-budget-healthcheck.timer
}

ensure_log_group() {
    local error_file

    error_file=$(mktemp)
    if ! aws logs create-log-group \
        --log-group-name /better-budget/production \
        --region "${AWS_REGION}" \
        --endpoint-url "${LOGS_ENDPOINT}" 2>"${error_file}"; then
        if ! grep --quiet ResourceAlreadyExistsException "${error_file}"; then
            cat "${error_file}" >&2
            rm -f "${error_file}"
            return 1
        fi
    fi
    rm -f "${error_file}"

    aws logs put-retention-policy \
        --log-group-name /better-budget/production \
        --retention-in-days 14 \
        --region "${AWS_REGION}" \
        --endpoint-url "${LOGS_ENDPOINT}"
}

bootstrap_host() {
    require_root

    local script_source

    script_source=$(readlink --canonicalize "$0")
    [[ -f ${script_source} ]] || fail 'Run the bootstrap from a local script file.'

    configure_ssm_dual_stack
    dnf install --assumeyes docker jq
    systemctl enable --now docker.service
    aws configure set default.use_dualstack_endpoint true
    create_swap

    install -d -m 0755 "$(dirname "${HOST_PROGRAM}")"
    install -m 0755 "${script_source}" "${HOST_PROGRAM}"
    ln -sfn "${HOST_PROGRAM}" "${DEPLOY_COMMAND}"
    ln -sfn "${HOST_PROGRAM}" "${SET_URL_COMMAND}"
    ln -sfn "${HOST_PROGRAM}" "${OWNER_COMMAND}"
    install -d -m 0700 "${CONFIG_DIRECTORY}"

    if [[ ! -e ${HOST_CONFIG} ]]; then
        tee "${HOST_CONFIG}" >/dev/null <<'CONFIG'
AWS_REGION=us-east-2
AWS_ACCOUNT_ID=563692880710
ECR_REPOSITORY=better-budget/app
SECRET_ID=arn:aws:secretsmanager:us-east-2:563692880710:secret:better-budget/prod-zALPFC
BETTER_AUTH_URL=https://ddz00reob9ubc.cloudfront.net
CONFIG
        chmod 0600 "${HOST_CONFIG}"
    fi

    if [[ ! -e ${IMAGE_TAG_FILE} ]]; then
        printf '%s\n' '4b1c52b013af9ea23574f876a900489d78bc6286' >"${IMAGE_TAG_FILE}"
        chmod 0600 "${IMAGE_TAG_FILE}"
    fi

    install_systemd_units
    load_host_config
    ensure_log_group
    ensure_database_network
    ensure_database_directories
    systemctl restart better-budget-db.service
    systemctl restart better-budget.service
    systemctl start better-budget-healthcheck.timer

    log 'Bootstrap completed. Check better-budget.service in systemd.'
}

main() {
    local invoked_as
    local command=${1:-}

    invoked_as=$(basename "$0")
    if [[ ${invoked_as} == 'better-budget-deploy' ]]; then
        deploy_image "$@"
        return
    fi
    if [[ ${invoked_as} == 'better-budget-set-url' ]]; then
        set_auth_url "$@"
        return
    fi
    if [[ ${invoked_as} == 'better-budget-owner' ]]; then
        shift || true
        run_owner_bootstrap "$@"
        return
    fi

    case ${command} in
        run)
            run_application
            ;;
        run-database)
            run_database
            ;;
        deploy)
            shift
            deploy_image "$@"
            ;;
        set-url)
            shift
            set_auth_url "$@"
            ;;
        owner)
            shift
            run_owner_bootstrap "$@"
            ;;
        healthcheck)
            check_liveness
            ;;
        '')
            bootstrap_host
            ;;
        *)
            fail "Unknown command: ${command}"
            ;;
    esac
}

main "$@"
