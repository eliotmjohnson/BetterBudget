# Formatting, comment, and release-documentation reference

Read this before changing formatter or linter configuration, before adding a
comment to any file, and before preparing a major release. `AGENTS.md` owns the
day-to-day conventions; this file holds the detail behind them.

Nothing here needs to be recalled by hand during normal work: `npm run verify:fix`
applies both tools, and the `Write|Edit` hook in `.claude/settings.json` runs
Prettier on every file the agent touches.

## The Prettier and ESLint Stylistic split

Prettier is the formatting source of truth for all supported code,
configuration, stylesheets, and Markdown. The required style uses an
80-character print width, four-space indentation using spaces, single quotes in
JavaScript/TypeScript and JSX, semicolons, LF endings, and no trailing commas.
Run `npm run format` after edits and before verification; never hand-format
around Prettier or introduce a conflicting formatter without explicit user
approval.

ESLint Stylistic owns structural whitespace that Prettier intentionally
preserves: import/directive separation, variable-group separation, blank lines
before returns and throws, class-member separation, block padding, meaningful
comment separation, comment spacing, one statement/declaration per line, Unix
line endings, file endings, and prevention of tabs, trailing whitespace, mixed
spacing, or excessive empty lines. Do not add ESLint rules for indentation
width, quotes, commas, semicolons, or line wrapping because those belong to
Prettier.

Keep `.prettierrc.json`, `.prettierignore`, and the pinned Prettier version
synchronized with any future formatting-workflow change. Generated files and
ignored static assets must not be pulled into formatting runs accidentally.

## Comments

The codebase is deliberately almost comment-free. Every comment that survives
in `src/` records something a competent reader could not have derived from the
code, and the same bar applies to anything new. A comment is the last resort,
reached only after renaming, extracting, and restructuring have failed.

### Before writing one

Work through this in order. Most candidate comments die at the first or second
step:

1. **Rename.** A comment explaining what a value is usually means the
   identifier is wrong. `titleRevealProgress` needs no gloss; `p` does.
2. **Extract.** A comment introducing a block ("// build the carryover chain")
   is the name of a function that has not been extracted yet.
3. **Encode it in the type.** A comment about which states are legal is a
   discriminated union, a branded identifier, or an exhaustive switch that has
   not been written.
4. **Delete it.** If it restates the line below, it is noise that will go stale.

Only if the fact still has nowhere to live does it become a comment.

### The admissible cases

A comment is justified when, and only when, it records one of these:

- **A financial invariant** that the arithmetic implements but does not state —
  the carryover-chain rule in `server/month-snapshot/carryover.ts` is the
  worked example.
- **A concurrency, ordering, or lifecycle guarantee** that the surrounding code
  depends on and cannot express.
- **A browser or framework workaround**, with the behavior being worked around
  named. `@property` registration in `styles/navigation-detail.css` is the
  worked example.
- **A cross-file coupling** a reader cannot follow from either side alone —
  a TypeScript constant that must match a CSS keyframe stop, or the reverse.
  Name the other file and symbol, and keep both ends pointing at each other.
- **The justification for a lint suppression.** An `eslint-disable` line
  without a reason above it is not acceptable.
- **A policy that the configuration cannot enforce on itself**, such as the
  no-exemptions note above the size budgets in `eslint.config.mjs`.

Everything else — section banners, restatements, changelog notes, commented-out
code, `TODO`/`FIXME` markers, and authorship or date stamps — does not belong in
the source. Version control and this documentation set already hold them.

### The shape

- Explain **why**, never **what**. A reader can see what the code does; they
  cannot see what forced it.
- Put it where the constraint bites — beside the line that would otherwise look
  wrong or arbitrary — not at the top of the file.
- Keep it to the fewest lines that carry the reason, and prefer a trailing
  comment on the declaration it qualifies.
- Write it so it stays true. A comment naming a mechanism survives; one naming
  line numbers, current values, or a work-in-progress does not.
- When the code it explains is changed or moved, the comment is part of that
  change: update it or delete it in the same edit. A comment that has drifted
  out of date is worse than no comment.

### JSDoc

JSDoc is the one form that may document an API rather than a constraint, and it
is still not automatic. Add it to an exported function, type, or field when a
consumer needs a fact the signature does not carry: a unit, a null meaning, a
precondition, or the reason a module was split out. Do not restate the name,
the parameter list, or the return type in prose. Field-level JSDoc in
`domain/types.ts` and the module-purpose blocks in `shared/detail-history.ts`
and `budget/budget-structure-editor.ts` are the intended level. Internal
helpers do not get JSDoc; if one needs explaining, its name is wrong.

### Stylistic constraint

`lines-around-comment` requires a blank line before an own-line comment while
`padding-line-between-statements` forbids a blank line between consecutive
`const`/`let`/`var` declarations, so an own-line comment cannot sit between two
declarations and `lint:fix` cannot resolve it. Use a trailing comment on the
declaration, start the comment at a block or object-literal start, or place it
above a preceding non-declaration statement.

## Size and complexity budgets

These are ESLint complexity rules, not formatting, so they sit outside the
Prettier/Stylistic split above. They exist because a file that cannot be read
without loading all of it is expensive for a person and for an agent, and
because runaway files are how this codebase drifted before.

| Rule                     | Limit | Scope              |
| ------------------------ | ----- | ------------------ |
| `max-lines`              | 500   | every `.ts`/`.tsx` |
| `max-lines-per-function` | 150   | `.ts` only         |
| `complexity`             | 30    | `.ts` only         |
| `max-depth`              | 3     | every `.ts`/`.tsx` |
| `max-params`             | 4     | every `.ts`/`.tsx` |
| `max-nested-callbacks`   | 3     | every `.ts`/`.tsx` |

`max-lines` counts skip blank lines and comments. Function length and
complexity are enforced on `.ts` only: a long React component in `.tsx` is
usually JSX rather than a design problem, while a long function in a server,
domain, or hook module is the thing worth catching. Prefer more parameters
becoming an options object, and a deep block becoming an early return.

Two shapes recur when a module has to be split and the code closes over shared
state. Both keep the moved bodies verbatim, which is what makes the split
checkable:

- **Explicit context parameter.** Hoist the closures to module scope and pass
  the refs, config, and helpers they captured as one `ctx` object, destructured
  at the top of each function. `ui/sortable-list/drag.ts`,
  `ui/navigation-detail/edge-drag.ts`, and
  `ui/navigation-detail/title-motion.ts` follow this. Where the closure shared a mutable cell, that cell becomes a
  field on a runtime object rather than a destructured binding.
- **Family modules behind one dispatcher.** A wide switch over a discriminated
  union becomes one module per family, with the entry point grouping case
  labels and delegating. `budget-service.ts` -> `server/budget-mutations/` and
  `shell/optimistic.ts` -> `shell/optimistic-patches/` are the pair; keep them mirrored, so
  a mutation's server handler and its optimistic patch stay easy to find
  together.

Two project invariants are enforced as lint rules rather than left to review:

- `crypto.randomUUID()` is banned under `src/components/**`. Use `createUuid()`
  from `@/domain/uuid`; mobile browsers withhold secure-context crypto over
  plain-HTTP LAN addresses. Server code may use it directly.
- `parseFloat` is banned under `src/domain`, `src/server`, and `src/db`. Money
  is exact signed bigint cents.

`no-console` allows only `console.error` and `console.warn`, and is off for
`scripts/**`, where stdout is the interface.

### No exemptions

`eslint.config.mjs` carries no per-file cap overrides, and none should be
added. Every source file is under the budgets above; when a limit is hit, split
the file or extract the function. A new override block would make the budgets
advisory, which is the state they were introduced to end.

## Major-release documentation

Every major release must add a new, clearly labeled version section to both
`README.md` and `AGENTS.md`. Preserve earlier version sections as a historical
record instead of rewriting them around the new release. At minimum, each new
major-version section must document:

- The release's new user-facing capabilities and important improvements.
- Changed or removed behavior and other breaking changes.
- Required data, configuration, authentication, deployment, or workflow
  migrations.
- Compatibility boundaries, retained non-goals, and any superseded guidance.

The Version 2 sections in `README.md` and `AGENTS.md` are the worked example of
that requirement; follow their shape for any future major release.
