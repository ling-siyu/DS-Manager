import { existsSync } from 'fs';
import { basename, resolve } from 'path';

export function resolveProjectPaths(cwd = process.cwd(), options = {}) {
  const { allowMissingTokens = false } = options;
  const fromRepoRoot = resolve(cwd, 'design-system');
  const dsRoot = basename(cwd) === 'design-system' ? cwd : fromRepoRoot;

  if (!allowMissingTokens && !existsSync(resolve(dsRoot, 'tokens.json'))) {
    throw new Error(
      'Could not locate design-system/tokens.json from the current working directory. ' +
      'Run this command from your project root or from the design-system directory.'
    );
  }

  const repoRoot = basename(dsRoot) === 'design-system' ? resolve(dsRoot, '..') : cwd;

  return {
    cwd,
    dsRoot,
    repoRoot,
    tokensPath: resolve(dsRoot, 'tokens.json'),
    componentsPath: resolve(dsRoot, 'components.json'),
    buildDir: resolve(dsRoot, 'build'),
    styleDictionaryConfigPath: resolve(dsRoot, 'style-dictionary.config.mjs'),
    claudePath: resolve(repoRoot, 'CLAUDE.md'),
    agentsPath: resolve(repoRoot, 'AGENTS.md'),
    iconsPath: resolve(dsRoot, 'icons.json'),
  };
}
