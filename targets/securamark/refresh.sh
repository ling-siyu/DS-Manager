#!/usr/bin/env sh
# Regenerate SecuraMark's DTCG token capture from the (read-only) source repo
# and validate that it still reproduces SecuraMark's real Tailwind theme.
#
# Drift check: run this, then `git diff targets/securamark/tokens.json`.
#   - no diff  → the capture is in sync with SecuraMark.
#   - a diff   → SecuraMark's tokens changed; review and commit the update.
#
# Usage:
#   targets/securamark/refresh.sh [path-to-securamark-frontend]
# Defaults the source to ~/Projects/securamark-frontend.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="${1:-$HOME/Projects/securamark-frontend}"
OUT="$REPO_ROOT/targets/securamark/tokens.json"

if [ ! -d "$SOURCE" ]; then
  echo "✗ SecuraMark source not found: $SOURCE" >&2
  echo "  Pass the path as the first argument." >&2
  exit 1
fi

# -C chdirs into the (read-only) target; --output is absolute so it lands back
# in this repo, never in SecuraMark. --validate proves Tailwind-theme fidelity.
node "$REPO_ROOT/design-system/bin/dsm.js" \
  -C "$SOURCE" \
  import-tokens src/designTokens.ts \
  --output "$OUT" \
  --validate tailwind.config.js
