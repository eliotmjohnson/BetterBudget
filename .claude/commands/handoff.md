---
description: Run the Better Budget pre-handoff verification sequence and report exactly what passed
allowed-tools: Bash, Read, Edit
---

Run the repository's Definition of done for the current change set. Do not skip
steps, and do not report success for a step you did not actually run.

## 1. Establish what changed

```bash
git status --short
git diff --stat
```

If the working tree is clean and nothing is staged, say so and stop — there is
nothing to hand off.

## 2. Run the verification sequence in order

`lint:fix` runs before `format` because ESLint's structural fixes can add or
remove blank lines that Prettier must then normalize.

```bash
npm run verify:fix
```

That runs `lint:fix` and `format`, then the read-only gate: `format:check`,
`typecheck`, and `lint`. Report the real output if any step fails.

Then, for any meaningful application, dependency, or build-configuration change:

```bash
npm run build
```

Skip `npm run build` only for changes limited to documentation, comments, or
formatting — and say that you skipped it and why.

## 3. Restore the generated development type file

`npm run build` rewrites `next-env.d.ts` to its production form. If the build
ran, restore the committed variant so the flip is never committed:

```bash
git checkout -- next-env.d.ts
git diff --stat -- next-env.d.ts
```

The second command must print nothing.

## 4. Apply exactly one version bump

Classify the whole change set with the Release versioning rules in `AGENTS.md`
and apply a single Semantic Versioning bump:

- **Patch** — bug, security, accessibility, visual, or performance fixes;
  internal refactors; shipped build/configuration corrections.
- **Minor** — backward-compatible capabilities, routes, workflows, API or
  data-model additions.
- **Major** — incompatible API, data, authentication, deployment, or workflow
  changes requiring migration. A major release must also add a new version
  section to both `README.md` and `AGENTS.md`.

Take the highest bump the change set requires, once. Skip the bump entirely for
read-only investigation or changes limited to documentation, comments,
formatting, or generated development state — and say that you skipped it.

When bumping, update `package.json` and both root `version` fields in
`package-lock.json`, then confirm they match:

```bash
node -e "const p=require('./package.json'),l=require('./package-lock.json');console.log(p.version,l.version,l.packages[''].version)"
```

All three must print the same value.

## 5. Check the documentation contract

If this change set altered workflows, environment variables, architecture,
commands, or product behavior, update `README.md`, `AGENTS.md`, or the relevant
`docs/agents/` reference in the same change set — whichever one actually owns
the behavior, rather than restating it in several. Moving or renaming a source
file counts: `AGENTS.md` names specific paths, and the `README.md` directory
tree lists every component folder. State explicitly whether documentation
needed updating.

## 6. Report

Before reporting, re-read **Traps that produce wrong conclusions** in
`AGENTS.md` if any verification involved a running dev server or the local
database. A passing HTTP check against a server you did not start proves
nothing.

Report, in plain terms:

- Every command that ran and whether it passed, with real output for failures.
- Any command deliberately skipped, and why.
- The version bump applied, or why none was needed.
- The manual flows exercised — required in proportion to risk for exact-money,
  carryover, split, retry, conflict, and authorization changes. If you did not
  exercise them, say so rather than implying they passed.
- Documentation updated, or confirmation that none was needed.

Never report a step as done when it was not run.
