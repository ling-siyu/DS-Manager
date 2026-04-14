import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import { resolveProjectPaths } from '../utils/paths.js';

const HOOK_MARKER = '# dsm:pre-commit';

const HOOK_BODY = `#!/bin/sh
${HOOK_MARKER}
# Design System Manager — validate design tokens before each commit.
# Installed by: dsm install-hook
# Remove this block to disable.

# Find dsm: prefer the project install, then the repo-local wrapper, then local/global node_modules
DSM="./node_modules/.bin/dsm"
if [ ! -x "$DSM" ]; then
  DSM="design-system/bin/dsm.js"
fi
if [ ! -f "$DSM" ] && [ ! -x "$DSM" ]; then
  DSM="$(npm root 2>/dev/null)/dsm/src/cli.js"
fi
if [ ! -f "$DSM" ]; then
  DSM="$(npm root -g 2>/dev/null)/dsm/src/cli.js"
fi

if [ -f "$DSM" ]; then
  node "$DSM" validate . --json > /dev/null 2>&1
  RESULT=$?
  if [ $RESULT -ne 0 ]; then
    echo ""
    echo "\\033[31m✗ dsm validate failed — commit blocked.\\033[0m"
    echo "  Run 'dsm validate .' for details, or use /tokenize to auto-fix violations."
    echo ""
    exit 1
  fi
else
  # dsm not found — skip silently so the hook doesn't break non-dsm projects
  exit 0
fi
`;

export async function installHookCommand(options = {}) {
  const { repoRoot } = resolveProjectPaths();
  const gitDir = resolve(repoRoot, '.git');

  if (!existsSync(gitDir)) {
    console.error(chalk.red('\n✗ No .git directory found. Run this from a git repository root.\n'));
    process.exit(1);
  }

  const hooksDir = resolve(gitDir, 'hooks');
  const hookPath = resolve(hooksDir, 'pre-commit');

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // If a pre-commit hook already exists, splice our block in rather than overwriting.
  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf8');

    if (existing.includes(HOOK_MARKER)) {
      console.log(chalk.yellow('\n⚠  dsm pre-commit hook already installed.\n'));
      return;
    }

    if (options.force) {
      // Append our block to the existing hook
      const updated = existing.trimEnd() + '\n\n' + HOOK_BODY;
      writeFileSync(hookPath, updated, 'utf8');
      chmodSync(hookPath, 0o755);
      console.log(chalk.green('\n✓ dsm validation block appended to existing pre-commit hook.\n'));
    } else {
      console.log(chalk.yellow('\n⚠  A pre-commit hook already exists at:'));
      console.log(chalk.dim(`   ${hookPath}`));
      console.log('\n   Re-run with --force to append the dsm block to the existing hook.\n');
      process.exit(1);
    }
  } else {
    writeFileSync(hookPath, HOOK_BODY, 'utf8');
    chmodSync(hookPath, 0o755);
    console.log(chalk.green('\n✓ Pre-commit hook installed:'));
    console.log(chalk.dim(`   ${hookPath}`));
    console.log(chalk.dim('\n   dsm validate will run before each commit.\n'));
  }
}
