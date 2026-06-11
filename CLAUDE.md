# Project Guidelines for Claude Code

## Project: AI-native design tool (forked from DS-Manager)

This repo is being evolved into an **AI-native UI/UX design tool**: a CLI where
**code is the source of truth**, an AI engine **generates and edits the design system
and UI as code**, and a **web surface lets human designers visually review and approve**
the result. Goal: replace Storybook in SecuraMark, then serve as the substrate for the
next app. The `dsm` CLI (source in `design-system/src/`) is the foundation we build on —
the original DS-Manager engine, kept and extended, not rewritten.

**Architectural stance:** this is a *standalone* tool. **SecuraMark is an external target /
dogfood project** at `~/Projects/securamark-frontend` (sibling dir). During foundation work
it is **READ-ONLY** — read its tokens/components, never write to its tracked branches. The
only writes to a target's real branches come later, via the gated AI edit loop
(approve/revert), never silently. **Sanctioned exception:** an *isolated, never-pushed,
never-merged* experiment branch in SecuraMark (e.g. `dsm-experiment`) used purely to
smoke-test that it can consume DSM output. Captured target data lives in this repo under
**`targets/<name>/`** (see `targets/securamark/`), never in the target.

## Current state

- **Branch:** `ai-native-rebuild`.
- **Phase 0 — DONE.** Added `-C, --target <path>` to the CLI (a `preAction` chdir hook).
  Baseline of `dsm` vs SecuraMark captured in **`docs/phase-0-baseline.md`** — read it first.
- **Phase 1 — DONE.** `dsm import-tokens` (TS→DTCG via esbuild bundle-and-import) +
  transitive `resolveReference`. SecuraMark's tokens captured at **`targets/securamark/`**
  (`refresh.sh` regenerates + validates; git diff is the drift check). `--validate`
  reconstructs SecuraMark's Tailwind theme from the DTCG and matches the real config exactly.
- **Phase 2 — DONE.** TS-compiler component discovery (ts-morph): imported/union/
  intersection/`Omit<>` prop types + `(typeof CONST)[number]` enums; `inherited` prop flag;
  registry persists authored props only.
- **Phase 3 — DONE, 🎯 Milestone 1 reached.** Vite+React19 preview (`dsm ui`): token category
  pages (self-hosted fonts incl. CJK, dense color grid, typography specimens, icon capture)
  + component matrix rendering DSM demos AND 12 real SecuraMark components cross-repo.
- **Phase 4.1 — DONE.** The **gated edit loop** (`dsm edit start|status|check|render|diff|
  approve|revert|abandon`, all `--json`; mirrored as MCP tools in `dsm serve`): git-gated
  sessions → typecheck/token validation → stage screenshots (puppeteer-core + installed
  Chrome, `#/stage/` route) → pixel diffs → approve(pathspec commit)/revert. Plus
  `dsm scan --fix` (unambiguous hex→token). **The brain is the coding agent you're already
  in** (Claude Code, or any MCP agent) — it makes the edits with its own tools and judges the
  PNGs with its own vision. **No model API key, ever** (the intelligence is the subscription-
  backed agent session, not a per-token API bill). One-command entry for Claude Code: the
  **`/dsm-edit` skill**; MCP setup in `docs/mcp-setup.md`. **Contract: `docs/phase-4-spec.md`.**
  Artifacts: `.dsm-edit/`.
  *(An API-key engine `dsm edit run` was prototyped then removed — off-strategy: the tool is
  for subscription use through a coding agent, so the agent is always the brain.)*

## Phased plan (milestone-first: validate the two hard upgrades before the UI)

0. **Connect & baseline** ✅ — `--target`, run `scan`/`sync-components` vs SecuraMark.
1. **TS→DTCG token importer** ✅ — `dsm import-tokens` (loads real values via esbuild
   bundle-and-import, not static parsing) + transitive `resolveReference`. Fidelity proven by
   `--validate` (reconstructs SecuraMark's Tailwind theme from the DTCG, matches exactly).
   Capture committed at `targets/securamark/`. *Deferred:* routing through `dsm build` so the
   generated `tailwind.tokens.cjs` byte-matches needs Style-Dictionary formatter work (its
   formatter is demo-`primitive.*`/`semantic.*`-specific) — left for when Phase 3 rebuilds the
   consumer.
2. **TS-parser component discovery** — replace the regex in `utils/component-discovery.js`
   with the TypeScript compiler API / ts-morph. Must follow imported prop types, resolve
   union/intersection/utility types, and expand `(typeof CONST)[number]` variant/size enums.
   (Phase 0 proved the regex returns `props:{}` for SecuraMark's Button — see baseline doc.)
3. **New Vite preview** — delete `src/ui/` + `src/ui-react/` (half-migrated Node-HTTP+esbuild
   app); rebuild on Vite + React 19 (matches SecuraMark). Token galleries, component matrix
   (uses the existing `previewProps`/`previewScenarios` schema in `components.json`),
   dark/light, viewports. **🎯 Milestone 1: SecuraMark's real tokens + components render here.**
4. **The AI loop** ✅ — NL → edit → type-check → render → screenshot → vision-verify →
   before/after diff → approve-commit / revert. Deterministic gated primitives + `scan --fix`,
   **agent-driven, no API key** (the coding agent is the brain; `/dsm-edit` skill + MCP) — see
   `docs/phase-4-spec.md`. *Next:* sandbox-branch editing of targets, preview Review page over
   `.dsm-edit/` artifacts, rgb/hsl `--fix`.

## Dev environment notes

- Deps live in `design-system/` (run from there). `node_modules` installed via a temp cache:
  `npm install --cache /tmp/dsm-npm-cache` (the global `~/.npm` cache has root-owned files —
  a known macOS npm bug; permanent fix is `sudo chown -R 501:20 ~/.npm`).
- CLI entry: `node design-system/bin/dsm.js <cmd>` or `node design-system/src/cli.js <cmd>`.
- Point at the target: `node bin/dsm.js -C ~/Projects/securamark-frontend <cmd>`.
- **Do NOT auto-start the dev/preview server to "verify" UI — the user reviews UI manually.**

**File conventions:**
- CLI commands in `design-system/src/commands/`
- Utilities in `design-system/src/utils/`
- All ESM (`"type": "module"` in package.json)

---

> The section below is auto-generated by `dsm generate-context` (describes DSM's own bundled
> demo design system, not the new project). Leave the `DSM:START/END` block untouched.

<!-- DSM:START -->
# Design System Guidelines
> Auto-generated by dsm generate-context. Do not edit manually.
> Full token reference: `design-system/context.md`

## ⚠️ CRITICAL RULES — ALWAYS FOLLOW

1. **NEVER use raw CSS values** — no hex colors, no `rgb()`, no hardcoded `px` values in inline styles.
2. **ALWAYS use semantic CSS variables** from `design-system/build/css-vars.css` or Tailwind token classes.
3. **ALWAYS use components from the registry** before creating a new one. Run `dsm list-components` to check.
4. **NEVER create a duplicate component** — if a component with `"doNotCreate": true` exists, use it.
5. **After adding a new component**, register it in `design-system/components.json` and run `dsm generate-context`.
6. **Import tokens** in your Tailwind config via `design-system/build/tailwind.tokens.cjs`.

---

## Token Naming Convention

```text
--ds-{layer}-{category}-{intent}-{modifier}

Examples:
  --ds-semantic-color-text-default
  --ds-semantic-color-background-subtle
  --ds-component-button-height-md
  --ds-primitive-color-brand-500
```

---

## CLI — Token & Component Lookups

Look up a token (partial name, full path, or CSS variable):
```bash
dsm get-token text-default
dsm get-token --ds-semantic-color-border-focus
dsm get-token background --json
```

List components (optional filter):
```bash
dsm list-components
dsm list-components --filter Button --json
```

Validate for violations:
```bash
dsm validate [path]
```

Full token reference: `design-system/context.md`

---

## Claude Code Commands

- `/tokenize` — replace hardcoded values in a file with token CSS variables
- `/new-component` — scaffold a new component that follows the design system
- `/audit-component` — check a component for design system violations

<!-- DSM:END -->

<!-- headroom:learn:start -->
## Headroom Learned Patterns
*Auto-generated by `headroom learn` on 2026-04-14 — do not edit manually*

### Commands
*~800 tokens/session saved*
- Always use `/usr/bin/git` for git operations, not bare `git` (bare `git` fails with command not found in this shell environment)
- Always use `/usr/bin/grep` for grep in Bash commands, not bare `grep` (bare `grep` fails with `rtk` command not found error)
- CLI entry point: `node src/cli.js <command>` from the `design-system/` directory

### Preview Server
*~700 tokens/session saved*
- DSM UI preview server name is `dsm-ui` (use `preview_start({'name': 'dsm-ui'})`); alternative names like `'DSM UI'` or `'DS Manager UI'` may return a different or new server
- Preview server config is at `.claude/launch.json`
- Use `preview_eval` with IIFE wrappers for navigation/inspection; `preview_click` with snapshot-derived `[uid]` selectors frequently fails — prefer `eval`-based `.click()` instead

### File Paths
*~600 tokens/session saved*
- Main token file: `design-system/tokens.json` — can exceed 10,000 tokens; always use `offset`/`limit` or targeted grep instead of reading whole file
- UI source files: `design-system/src/ui/{pages.js, components.js, styles.css, models.js, utils.js, app.js, index.html}`
- Style Dictionary config: `design-system/style-dictionary.config.mjs`
- Icon token file: `design-system/icons.json`

### Token Architecture
*~600 tokens/session saved*
- Token structure follows W3C DTCG: `primitive.*` and `semantic.*` namespaces in `tokens.json`
- Supported token types: color, spacing, typography (composite), shadow, border-width, border-radius, duration, cubicBezier, icon
- Each new token type needs: entry in `tokens.json`, transform rule in `style-dictionary.config.mjs`, classifier in `src/ui/utils.js`, model in `src/ui/models.js`

### Grep Tool Usage
*~500 tokens/session saved*
- The Grep tool does NOT accept a `file_path` parameter — use the `include` parameter for path filtering instead. Passing `file_path` causes InputValidationError and requires a retry.
- Wrap multi-statement JS eval expressions in IIFEs `(() => { ... })()` to avoid `SyntaxError: Identifier already declared` on repeated evals in the same browser session.

### Build & Verify
*~400 tokens/session saved*
- After editing `tokens.json` or `style-dictionary.config.mjs`, run `cd design-system && node src/cli.js build` to regenerate `build/css-vars.css` and `build/tokens.js`
- `coderabbit review --plain -t committed` fails if the commit hasn't been pushed yet; use `coderabbit review --plain -t all` as fallback

<!-- headroom:learn:end -->
