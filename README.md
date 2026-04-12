# Design System Manager (dsm)

A CLI tool to tokenize, build, and enforce your design system across any codebase — with first-class Claude Code integration.

---

## Installation

```bash
cd design-system
npm install
npm link   # makes `dsm` available globally
```

Or run commands directly without linking:

```bash
node design-system/src/cli.js <command>
```

---

## Quick Start

Bootstrap a new project from scratch:

```bash
dsm init
```

This scaffolds `tokens.json`, `components.json`, the Style Dictionary config, Claude Code settings, and installs the pre-commit validation hook.

Then build your tokens:

```bash
dsm build
```

---

## Commands

### `dsm init`

One-command project bootstrap. Scaffolds all required config files in the current directory and installs the pre-commit hook.

```bash
dsm init
```

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

```bash
dsm install-hook           # fails if a hook already exists
dsm install-hook --force   # appends to an existing hook
```

### `dsm serve`

Starts an MCP (Model Context Protocol) stdio server. Used internally by Claude Code — you typically don't need to run this manually.

```bash
dsm serve
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
