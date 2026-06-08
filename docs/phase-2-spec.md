# Phase 2 — TS-parser component discovery (spec + autonomous run protocol)

**Goal:** replace the regex prop-inference in
`design-system/src/utils/component-discovery.js` with a TypeScript-compiler-based
resolver (via **ts-morph**, already installed) so `dsm sync-components` extracts
real props/variants/sizes for SecuraMark-style components.

This spec is the source of truth for an **autonomous run**. The success gate is a
test oracle — when the tests below are green, Phase 2 is done.

## Why (the current failure)

Phase 0 proved the regex parser returns `props:{}`, `variants:[]`, `sizes:[]` for
SecuraMark's `Button` (and 13/76 components got zero props). Three root causes,
all reproduced hermetically in `design-system/test/fixtures/ts-discovery/`:

1. **Prop types are imported, not local.** `Button.tsx` does
   `import type { ButtonProps } from '../../types/ui'`; the regex only searches the
   same file (`extractTypeBlock`).
2. **The type is a discriminated union of intersections** built on `Omit<…>`:
   `ButtonProps = IconOnlyButtonProps | TextButtonProps`, each
   `ButtonBaseProps & … & {…}`, `ButtonBaseProps = Omit<ButtonHTMLAttributes<…>, 'children'> & {…}`.
   The regex only matches a flat `interface X {…}` / `type X = {…}`.
3. **Variants/sizes come from `as const` arrays:** `variant?: ButtonVariant` where
   `ButtonVariant = (typeof BUTTON_VARIANTS)[number]`. The regex only captures inline
   `'a' | 'b'` literal unions.

## Requirements

- **R1 — Cross-file types.** Resolve a component's prop type even when it is
  imported from another module.
- **R2 — Composite types.** Resolve unions (`|`), intersections (`&`), and utility
  types (`Omit`, `Pick`, `Partial`, …) to their concrete member set. For a
  **union**, props = the **union of all properties across all members** (the full
  catalogue of what the component can accept), not just the common subset.
- **R3 — Enum expansion.** Expand `(typeof CONST)[number]` (and direct literal
  unions) into the concrete string members for `variant` → `variants` and
  `size` → `sizes`.
- **R4 — Optionality.** Mark non-optional props `required: true`; leave optional
  props without it (matches the current shape).
- **R5 — Unchanged contract.** `discoverComponents(repoRoot, options)` keeps its
  return shape exactly: `{ components: [...], byName: Map, scannedPatterns }`, each
  component `{ name, path, props, variants, sizes, discoveredFrom }`. All existing
  tests (`test/doctor-sync.test.js` etc.) must still pass.
- **R6 — Graceful degradation.** If a target has its own `tsconfig.json`, use it;
  otherwise fall back to sane defaults (`jsx: react-jsx`, `allowJs`, no lib check).
  External types that cannot be resolved (e.g. missing `@types/react`) must not
  throw — capture what is resolvable and continue.
- **R7 — Own vs inherited.** Tag each prop whose declarations all come from
  outside the target (node_modules / TS lib) with `inherited: true`. Props authored
  in the target repo carry no flag. This is additive to the shape (R5 holds) and
  lets Phase 3 show authored props by default while folding the DOM/aria/event
  surface (e.g. SecuraMark's `Button` resolves 293 props; only ~9 are authored).

## Approach (recommended)

- Use **ts-morph** (`new Project({...})`). Add the discovered files; for each
  component, find its parameter's type, get `getApparentType()` /
  `getProperties()`, iterating `getUnionTypes()` to union members per R2. For each
  property use `getTypeAtLocation` + `isUnion`/`getLiteralValue` to expand enums
  (R3) and `isOptional()` for R4.
- Keep component **detection** (which exports are components) as-is if it works, or
  move it into ts-morph too — your call, as long as R5 holds.
- Put the resolver in `component-discovery.js` (replacing `inferPropsForComponent`
  and its regex helpers) or a new `src/utils/ts-component-discovery.js` that
  `component-discovery.js` delegates to. Either is fine.
- Create one shared `Project` per `discoverComponents` call (not per file) for
  speed; performance on a ~80-component repo of a few seconds is acceptable.

## Success gate (the oracle)

```
cd design-system && node --test test/*.test.js
```

Must be **all green**, specifically including `test/component-discovery-ts.test.js`:
- Card (local interface) and the return-shape test — already pass; must stay green.
- Badge (imported interface + `BADGE_VARIANTS` enum) — must pass.
- Button (imported union/intersection/`Omit` + `BUTTON_VARIANTS`/`BUTTON_SIZES`) —
  must pass.
- Integration test against the real SecuraMark `Button` — must pass when the
  sibling repo is present (it is, on this machine). It asserts non-empty props and
  the real variant/size sets.

Secondary sanity check (not required to be diffed, just shouldn't error):
```
node bin/dsm.js -C ~/Projects/securamark-frontend sync-components --dry-run
```
SecuraMark's `Button` should no longer show empty props.

## Autonomous run protocol

1. Work on branch `ai-native-rebuild`. The working tree already contains the spec,
   fixtures, failing oracle, and `ts-morph` in `package.json` (uncommitted) — build
   on top of them.
2. Implement against the requirements. Re-run the gate after each change.
3. **Checkpoint commits are allowed and encouraged** (commit locally as tests go
   green). **Do NOT push.** **Do NOT run the interactive code-review skill.** Review
   + push happen with the user.
4. **Stop when the full suite is green** (end the loop — do not schedule another
   wake-up). Leave a short summary of what changed.
5. **Bail-out:** if the same test fails the same way across ~5+ iterations, stop and
   write what's blocking to the end of this file under a "## Run notes" heading —
   do not thrash or weaken the tests to force green. The oracle must not be edited
   to pass; only the implementation changes.

## Constraints

- Read-only on SecuraMark (the integration test only reads it).
- Don't regress DSM's own demo-component discovery or the doctor/sync flows.
- ts-morph is a runtime dep (bundled) — fine to import from `component-discovery.js`.
