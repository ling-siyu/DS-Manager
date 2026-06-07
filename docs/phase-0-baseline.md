# Phase 0 — Baseline: DSM against SecuraMark

Captured 2026-06-07, running the current (forked) `dsm` against `../securamark-frontend`
(read-only on the target). Branch: `ai-native-rebuild`.

## What works now

- **`-C, --target <path>`** added to the CLI (`src/cli.js`): a `preAction` hook resolves
  the path against the original cwd and `chdir`s into it, so every command operates on the
  target with no per-command changes. Verified: `dsm -C ~/Projects/securamark-frontend scan src`.
- **`scan`** runs cleanly against SecuraMark: **34 errors, 49 warnings**. Mostly
  `arbitrary-spacing` warnings (`w-[22rem]` in stories) and some hardcoded colors.
  The detector itself works.
- **`sync-components`** discovers **76 components** (SecuraMark has ~83 → ~7 missed entirely).

## Confirmed gaps (drive Phases 1–2)

### 1. Component discovery fails on SecuraMark's typing style — the big one

`sync-components` extracted **`props: {}`, `variants: []`, `sizes: []` for Button** and
**13 / 76 components got zero props** (Button, Badge, FileUploadField, Layout,
SessionExpiredModal, AboutSection, ComparisonSection, Footer, ImageWithSkeleton,
ModalAnimatedContent, PressQuotesSection, SocialLinksSection, WechatDropdownRow).

Root cause, confirmed against `src/components/ui/Button.tsx` + `src/types/ui.ts`:

1. **Prop types are imported, not local.** `Button.tsx` does
   `import type { ButtonProps } from '../../types/ui'`. The current regex parser
   (`utils/component-discovery.js` → `inferPropsForComponent`) only searches for an
   `interface ButtonProps {}` / `Props {}` block *in the same file*, so it finds nothing.
2. **The type is a discriminated union of intersections.**
   `ButtonProps = IconOnlyButtonProps | TextButtonProps`, each `ButtonBaseProps & … & {…}`,
   where `ButtonBaseProps = Omit<ButtonHTMLAttributes<…>, 'children'> & {…}`.
   `extractTypeBlock` only matches a flat `interface X {…}` / `type X = {…}` — it cannot
   resolve unions, intersections, or `Omit<…>`.
3. **Variants/sizes come from `as const` arrays.** `variant?: ButtonVariant` where
   `ButtonVariant = (typeof BUTTON_VARIANTS)[number]`. `parsePropsBlock` only captures
   inline `'a' | 'b'` literal unions, so `(typeof CONST)[number]` variant/size enums are missed.

**Phase 2 requirement:** replace regex discovery with the TypeScript compiler API
(or ts-morph) that can (a) follow imported prop types across files, (b) resolve
union/intersection/utility types via the checker, (c) resolve `(typeof CONST)[number]`
to its literal members for variants/sizes.

### 2. `scan --json` output is not pure JSON

`printScanResults` (`commands/scan.js`) prints the `🔍 Scanning <path>` header via
`console.log` **before** the `options.json` branch, so `--json` consumers must strip a
non-JSON prefix. Fix: gate all human-readable output behind `!options.json`.

### 3. `scan --fix` is declared but unimplemented

`cli.js` declares `-f, --fix` but `scanCommand` never reads it (no replace path).
Either implement or remove the flag.

## Not yet investigated

- The ~7 components discovered-count shortfall (76 vs ~83) — which components are missed
  entirely (vs found-but-no-props) and why.
- Token side: SecuraMark tokens are TS-native (`src/designTokens/`), so `dsm build` /
  `get-token` can't run against it yet — that's Phase 1 (TS→DTCG importer).
