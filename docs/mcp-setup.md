# Driving `dsm` from a coding agent (MCP) — no API key

`dsm serve` is a stdio MCP server that exposes the design-system lookups **and the
full gated edit loop** as tools. The coding agent (Claude Code, or any MCP agent)
is the brain: it calls these tools, **reads the screenshot PNGs itself**, and
decides approve vs revert. No model API key is involved anywhere — the
intelligence is the agent session you're already running.

## Claude Code

This repo ships `.mcp.json` at its root, so Claude Code offers the `dsm` server
automatically when you open the project — approve it once when prompted. To add it
by hand instead:

```bash
claude mcp add dsm -- node design-system/bin/dsm.js serve
```

(Run from the repo root. The same `node design-system/bin/dsm.js serve` command is
what `.mcp.json` runs.)

In practice you usually don't need the MCP server at all in Claude Code — the
**`/dsm-edit` skill** (`.claude/commands/dsm-edit.md`) drives the same loop over the
plain CLI and is the recommended entry point. The MCP server matters most for *other*
agents and for headless/scripted drivers.

## Tools exposed

| Tool | What it does |
|---|---|
| `get_token` | Look up a token by name / CSS var. |
| `list_components` | Registered components + variants/props. |
| `validate_file` | Scan a file/dir for hardcoded-value violations. |
| `edit_start` / `edit_status` | Open / inspect a git-gated session. |
| `edit_check` | Type-check changed files; validate + rebuild tokens. |
| `edit_render` | Screenshot affected components → PNG paths (label `before`/`after`). |
| `edit_diff` | Code diff + pixel diff of the before/after shot sets → PNG paths. |
| `edit_approve` / `edit_revert` / `edit_abandon` | Commit scope / restore base / keep-and-end. |
| `scan_fix` | Replace unambiguous hardcoded hex with token vars (in-session). |

## The brain contract (any agent)

The loop is agent-agnostic — nothing here is Claude-Code-specific:

1. `edit_start` → `edit_render(label:"before", components:[…])`
2. Make the edit with your own file-editing tools (prefer `tokens.json` — it cascades).
3. `edit_check` — fix and re-check until it passes.
4. `edit_render(label:"after")` → `edit_diff`.
5. **Read the returned before/after/diff PNG paths with your own vision** and judge
   against the instruction.
6. Present the verdict, then `edit_approve` (on user OK) or `edit_revert`.

`edit_render` / `edit_diff` can take ~10–30s (Vite + headless Chrome boot) — call
patiently, don't retry. Requires the machine's Chrome (set `CHROME_PATH` if it isn't
auto-found). Full contract: `docs/phase-4-spec.md`.
