# Design System Manager (dsm)

A CLI tool to tokenize, build, and enforce your design system across any codebase — with first-class Claude Code integration.

---

## Use In A Project

From this repo, install DSM’s own dependencies once:

```bash
cd design-system
npm install
```

Then bootstrap an existing app from that app’s root:

```bash
node /absolute/path/to/DS-Manager/design-system/src/cli.js init
```

This scaffolds `tokens.json`, `components.json`, the Style Dictionary config, Claude Code settings, installs `dsm` into the target project as a dev dependency when `package.json` is present, and installs the pre-commit validation hook. After that, use DSM from inside the target project with:

```bash
npx dsm build
npm run dsm:validate
```

If the target project does not have a `package.json`, or if you want scaffold-only mode, use:

```bash
node /absolute/path/to/DS-Manager/design-system/src/cli.js init --skip-install
```

---

## Develop DSM

If you are working on DSM itself, run commands from this repo with:

```bash
node design-system/src/cli.js <command>
```

If you want a global shortcut while developing locally:

```bash
cd design-system
npm link
```

---

## Commands

### `dsm init`

One-command project bootstrap. Scaffolds all required config files in the current directory, installs `dsm` into the target project when possible, and installs the pre-commit hook.

```bash
dsm init
dsm init --skip-install   # scaffold only, keep using the local wrapper
```

After a successful install, the target project gets:
- `devDependencies.dsm` pointing at `design-system/vendor/*.tgz`
- npm scripts like `npm run dsm:validate`
- `.claude/settings.json` wired to the project-local DSM install

### `dsm build`

Compiles `tokens.json` into:
- `build/css-vars.css` — CSS custom properties
- `build/tailwind.tokens.cjs` — Tailwind token config
- `build/tokens.js` — JS token map
- `build/CHANGELOG.md` — Token diff since last build
- `build/tokens.snapshot.json` — Snapshot for diffing

```bash
dsm build
```

### `dsm watch`

Watches `tokens.json` and `components.json` for changes, rebuilds and regenerates context files automatically.

```bash
dsm watch
```

### `dsm generate-context`

Regenerates `CLAUDE.md` and `AGENTS.md` with up-to-date design system rules and the full token reference in `context.md`.

Run this after adding or editing tokens or components.

```bash
dsm generate-context
```

### `dsm get-token <query>`

Look up a token by partial name, full path, or CSS variable name.

```bash
dsm get-token text-default
dsm get-token --ds-semantic-color-border-focus
dsm get-token background --json     # machine-readable output
```

### `dsm list-components [--filter <name>]`

List all registered components with their variants, sizes, and required props.

```bash
dsm list-components
dsm list-components --filter Button
dsm list-components --filter Button --json
```

### `dsm scan [path]`

Scan a directory or file for hardcoded values that should be design tokens — hex colors, `rgb()`/`rgba()`, arbitrary Tailwind values, inline styles, etc.

```bash
dsm scan src/
dsm scan src/components/Button.tsx
dsm scan . --json
```

### `dsm validate [path]`

Same as `scan`, but exits with code `1` if violations are found. Used by the pre-commit hook.

```bash
dsm validate src/
```

### `dsm install-hook`

Installs a git pre-commit hook that runs `dsm validate` before every commit. Blocks commits with token violations.

The hook prefers the project-local `dsm` install from `node_modules/.bin` and falls back to the repo-local wrapper if needed.

```bash
dsm install-hook           # fails if a hook already exists
dsm install-hook --force   # appends to an existing hook
```

### `dsm update`

Refreshes a pilot project from the DSM checkout you are currently running. This repacks the current local DSM source, reinstalls it into the target project, refreshes scripts and MCP wiring, and rebuilds generated context by default.

```bash
dsm update
dsm update --skip-build
```

### `dsm serve`

Starts an MCP (Model Context Protocol) stdio server. Used internally by Claude Code — you typically don't need to run this manually.

```bash
dsm serve
```

### `dsm ui`

Starts a local preview for designers and agents. The UI groups tokens at `Lv.0`, treats leaf components as `Lv.1`, and derives higher levels from component composition metadata in `components.json`.

```bash
dsm ui
dsm ui --port 7788 --no-open
```

---

## Token Naming Convention

```
--ds-{layer}-{category}-{intent}-{modifier}
```

| Layer | Examples |
|---|---|
| `primitive` | `--ds-primitive-color-brand-500` |
| `semantic` | `--ds-semantic-color-text-default`, `--ds-semantic-color-background-subtle` |
| `component` | `--ds-component-button-height-md` |

Always use CSS variables from `build/css-vars.css` or the Tailwind token classes — never hardcode hex, `px`, or `rgb()` values.

---

## Token Structure

Tokens follow the [W3C DTCG](https://design-tokens.github.io/community-group/format/) format with `$value`, `$type`, and `$description` fields.

Three layers in `tokens.json`:

- **primitive** — raw values: colors, spacing scale, typography, border radii, shadows
- **semantic** — intent-based aliases: background, text, border, interactive states, status colors
- **component** — per-component tokens: button height, input padding, card shadow, etc.

---

## Component Registry

Components are registered in `components.json`. All registered components are marked `"doNotCreate": true` — AI agents must use them, not recreate them.

Optional `contains` metadata lets DSM derive hierarchy levels automatically:

- `Lv.0` — tokens
- `Lv.1` — components with no registered child components
- `Lv.2+` — components that contain lower-level components

Example:

```json
{
  "name": "Modal",
  "contains": ["Button", "Typography"]
}
```

Registered components: `Button`, `Input`, `Card`, `Badge`, `Tooltip`, `Modal`, `Typography`

After adding a new component, register it in `components.json` and run:

```bash
dsm generate-context
```

---

## Claude Code Integration

Three Claude Code skills are available:

| Skill | What it does |
|---|---|
| `/tokenize` | Replaces hardcoded values in a file with token CSS variables |
| `/new-component` | Scaffolds a new component that follows the design system |
| `/audit-component` | Checks a component for design system violations |

The MCP server (`dsm serve`) exposes `get_token`, `list_components`, and `validate_file` tools to Claude Code directly.

---

## Generated Files

| File | Description |
|---|---|
| `build/css-vars.css` | CSS custom properties — import into your global stylesheet |
| `build/tailwind.tokens.cjs` | Tailwind config extension — import in `tailwind.config.js` |
| `build/tokens.js` | JS token map for runtime use |
| `build/CHANGELOG.md` | Auto-generated diff of token changes since last build |
| `context.md` | Full token reference — imported by CLAUDE.md and AGENTS.md |
| `CLAUDE.md` | Design system rules for Claude Code |
| `AGENTS.md` | Design system rules for Codex and other agents |

---

## Project Layout

```
design-system/
├── src/
│   ├── cli.js                    # CLI entry point
│   ├── commands/                 # One file per subcommand
│   └── utils/
│       └── tokens.js             # Shared token utilities
├── build/                        # Generated — do not edit
├── tokens.json                   # Edit this to change tokens
├── components.json               # Edit this to register components
├── context.md                    # Auto-generated — do not edit
└── style-dictionary.config.mjs   # Style Dictionary pipeline config
```
