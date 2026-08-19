FROM node:24-alpine AS base

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS owner-bootstrap
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY runtime-environment.mjs runtime-environment.d.mts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
USER nextjs
CMD ["npm", "run", "db:owner"]

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --chown=nextjs:nodejs runtime-environment.mjs ./runtime-environment.mjs
COPY --chown=nextjs:nodejs scripts/migrate-production.mjs ./scripts/migrate-production.mjs
COPY --chown=nextjs:nodejs scripts/validate-production-environment.mjs ./scripts/validate-production-environment.mjs
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=4 CMD wget -qO- http://127.0.0.1:3000/api/live || exit 1
CMD ["sh", "-c", "node scripts/validate-production-environment.mjs && node scripts/migrate-production.mjs && node server.js"]
