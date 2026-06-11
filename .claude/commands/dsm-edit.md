Run a visual, git-gated design edit through the `dsm` edit loop — YOU are the brain.

The user gives a natural-language design instruction (e.g. "make the buttons pill-shaped",
"warm up the neutral palette", "tighten the card padding"). You implement it as a gated
edit: render before, make the change yourself, type-check, render after, look at the
screenshots with your own vision, and approve or revert on the user's say-so.

**No API key, ever.** `dsm` only runs the gates and renders screenshots; the intelligence
is you. Do not call any model API or look for `dsm edit run` — that command does not exist.

## CLI

Run from the repo root: `node design-system/bin/dsm.js edit <sub>` (alias `dsm` if linked).
Every subcommand takes `--json`; prefer it so you can parse results reliably.

## The loop — follow in order

1. **Start a session.**
   `dsm edit start --json`
   - Pins the base commit + scope (default `design-system/`, auto-extended to `build/` when
     tokens are touched). Fails if the working tree is dirty in scope — if so, tell the user
     and stop (or pass `--allow-dirty` only if they confirm the pre-existing changes are part
     of this edit).
   - If a session is already active, reuse it (don't `--force` unless the user asks).

2. **Render the BEFORE state.**
   `dsm edit render --label before --json`
   - Screenshots every affected component to `.dsm-edit/<session>/shots/before/`.
   - Until you've made an edit, nothing is "affected" yet, so pass the components you expect
     to change: `--component Button Card …`. (List registered ones with `dsm list-components`.)
   - Needs the machine's Chrome. If it reports no Chrome, tell the user to install Google
     Chrome or set `CHROME_PATH`, and stop.

3. **Make the edit yourself.** Use your Edit/Write tools.
   - **Prefer design tokens over component code.** A visual instruction is almost always a
     `design-system/tokens.json` change (it cascades to every component). Look up the right
     token with `dsm get-token <name>` and edit its `$value`. Only touch component `.tsx`
     when the instruction is genuinely structural.
   - Never hardcode raw values where a token exists. Keep the change minimal — implement the
     instruction and nothing else.

4. **Check.**
   `dsm edit check --json`
   - Type-checks changed files and, for token edits, validates references + rebuilds.
   - If it fails (`ok:false`), read the diagnostics, fix your edit, and check again. Don't
     proceed until it passes.

5. **Render the AFTER state.**
   `dsm edit render --label after --json`
   - Use the same `--component` set you used for `before` (so the pairs line up).

6. **Diff.**
   `dsm edit diff --json`
   - Writes `diff.patch` (the code change) and a pixel report per before/after pair
     (`changedPct` each). 0% on a variant that shouldn't change is fine; 0% everywhere means
     your edit had no visual effect — investigate.

7. **Judge with your own vision.** Read the PNG files — this is the verification step:
   - `Read .dsm-edit/<session>/shots/before/<shot>.png` and the matching `after/` and
     `shots/diff/<shot>.png`.
   - Compare against the instruction: is it satisfied? Any regression (unintended change to
     color, layout, text, spacing) the pixel diff flagged?

8. **Present + gate.** Show the user the before/after screenshots and your verdict (satisfied
   or not, plus any issues). Then:
   - On their approval: `dsm edit approve -m "<concise message>" --json` (pathspec-commits
     only the scope).
   - If they want it undone, or your verdict is "not satisfied": `dsm edit revert --json`
     (restores the base state exactly).
   - To stop but keep the working-tree changes for manual tweaking: `dsm edit abandon --json`.

## Notes

- The whole loop is safe to retry — the session is the safety net; nothing is committed until
  `approve`. If anything goes sideways, `dsm edit revert` returns to the base commit.
- `dsm edit status --json` shows the active session, changed files, and HEAD drift at any time.
- For mechanical token cleanups (replace hardcoded hex with token vars), `dsm scan --fix`
  inside the session does the unambiguous ones and reports the rest for you to resolve.
- This same loop is available to any MCP agent via `dsm serve` (see `docs/mcp-setup.md`); the
  contract is identical — drive the tools, Read the shot PNGs, decide approve vs revert.
