# Target: SecuraMark

A captured snapshot of [SecuraMark](https://codeup.aliyun.com/.../securamark-frontend)'s
design tokens, imported into DSM's DTCG format. SecuraMark is DSM's **dogfood target**;
this directory is where its design system lives *as data inside this repo*.

## Files

- **`tokens.json`** — SecuraMark's tokens in W3C DTCG form, produced by
  `dsm import-tokens`. 113 tokens across 13 groups (color with dark/light
  variants, fontFamily, fontSize, fontWeight, letterSpacing, animation
  duration/easing/transition, borderRadius, boxShadow, aspectRatio, iconSize,
  semanticTypography). **Generated — do not hand-edit;** regenerate instead.
- **`refresh.sh`** — regenerate `tokens.json` from the source repo and validate it.

## Read-only stance

SecuraMark (`~/Projects/securamark-frontend`) is **read-only** during foundation
work. We only ever *read* its tokens; the capture lands here, never in SecuraMark.
The one sanctioned exception is an **isolated, never-pushed experiment branch** in
SecuraMark used purely to smoke-test that it can consume DSM output (see the
project `CLAUDE.md`). That branch is a sandbox — it is never merged into
`registration`/`dev`/`main`.

## Regenerate + validate

```sh
targets/securamark/refresh.sh            # uses ~/Projects/securamark-frontend
targets/securamark/refresh.sh /path/to/securamark-frontend
```

This runs `dsm import-tokens` against the read-only source and, via `--validate`,
reconstructs SecuraMark's Tailwind theme from the imported DTCG and diffs it
against the real `tailwind.config.js`. It currently matches **exactly**.

## Drift check

`refresh.sh` writes in place, so git is the drift detector:

```sh
targets/securamark/refresh.sh
git diff targets/securamark/tokens.json
```

- **No diff** → the capture is in sync with SecuraMark.
- **A diff** → SecuraMark's tokens changed upstream; review and commit the update.
