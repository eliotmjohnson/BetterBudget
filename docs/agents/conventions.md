# Formatting, comment, and release-documentation reference

Read this before changing formatter or linter configuration, before adding
JSDoc or explaining code anywhere, and before preparing a major release. `AGENTS.md` owns the
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

Source code carries no comments except JSDoc. Every explanation — why a value
was chosen, which browser behavior a workaround targets, which invariant the
arithmetic implements, what couples two files — lives in the documentation set
instead: `AGENTS.md`, `README.md`, or the `docs/agents/` reference that owns the
area. This applies to every language in the repository: TypeScript, CSS, and
configuration files alike.

### Why

A comment is documentation stored where only a reader of that one file will
find it, and it drifts silently when the code around it changes. Keeping the
reasoning in the documentation set means there is one place to read before a
change and one place to update with it, and the source stays a precise
statement of what the code does.

### Before writing code that needs explaining

Work through this in order. Most explanations disappear at the first or second
step:

1. **Rename.** An explanation of what a value is usually means the identifier
   is wrong. `titleRevealProgress` needs no gloss; `p` does.
2. **Extract.** An explanation introducing a block ("build the carryover chain")
   is the name of a function that has not been extracted yet.
3. **Encode it in the type.** An explanation of which states are legal is a
   discriminated union, a branded identifier, or an exhaustive switch that has
   not been written.
4. **Document it.** What still needs saying — a financial invariant, an
   ordering or lifecycle guarantee, a browser or framework workaround and the
   behavior it works around, a cross-file coupling, a tuned constant and why it
   has that value — goes into the document that owns the area, in the same
   change as the code. Name the file and symbol there so a reader can find the
   code from the documentation.

Section banners, restatements, changelog notes, commented-out code,
`TODO`/`FIXME` markers, and authorship or date stamps have no place anywhere:
version control and the documentation set already hold them.

### Lint suppressions

An `eslint-disable` directive states its reason in the directive's own
description, after `--`, for example
`// eslint-disable-next-line some-rule -- reason`. That description is part of
the directive, not a separate comment, and a suppression without one is not
acceptable.

### Existing comments

Comments written before this rule are legacy. When a change touches code that
carries one, move its content into the owning document and delete it in the
same change. Do not add to or extend a legacy comment.

### JSDoc

JSDoc (`/** … */`) is the only comment form allowed in source, and it is still
not automatic. Add it to an exported function, type, or field when a
consumer needs a fact the signature does not carry: a unit, a null meaning, a
precondition, or the reason a module was split out. Do not restate the name,
the parameter list, or the return type in prose. Field-level JSDoc in
`domain/types.ts` and the module-purpose blocks in `shared/detail-history.ts`
and `budget/budget-structure-editor.ts` are the intended level. Internal
helpers do not get JSDoc; if one needs explaining, its name is wrong. JSDoc
describes the contract a consumer relies on; rationale and history still belong
in the documentation set.

### Stylistic constraint

`lines-around-comment` requires a blank line before an own-line comment while
`padding-line-between-statements` forbids a blank line between consecutive
`const`/`let`/`var` declarations, so a JSDoc block cannot sit between two
declarations and `lint:fix` cannot resolve it. Start the block at a block or
object-literal start, or place it above a preceding non-declaration statement.

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
