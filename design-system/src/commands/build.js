import chalk from 'chalk';
import { resolveProjectPaths } from '../utils/paths.js';
import {
  readBuiltTokens,
  readSnapshot,
  writeSnapshot,
  diffTokens,
  renderChangelogEntry,
  updateChangelog,
} from '../utils/diff.js';

/**
 * Throwing core: compile tokens.json via Style Dictionary, snapshot, and update
 * the changelog. No console UI, no process.exit — safe to call from the edit
 * loop and the MCP server. Returns { diff | null } (null on first build).
 */
export async function runBuild(paths = resolveProjectPaths()) {
  const { styleDictionaryConfigPath, buildDir } = paths;

  // Snapshot tokens before build (if a previous build exists)
  const prevTokens = readSnapshot(buildDir) ?? readBuiltTokens(buildDir);

  const StyleDictionary = (await import('style-dictionary')).default;
  const { default: config, registerFormats } = await import(styleDictionaryConfigPath);

  const sd = new StyleDictionary(config);
  registerFormats(sd);
  await sd.buildAllPlatforms();

  const currTokens = readBuiltTokens(buildDir);
  if (!currTokens) return { diff: null };

  writeSnapshot(buildDir, currTokens);
  if (!prevTokens) return { diff: null };

  const diff = diffTokens(prevTokens, currTokens);
  const entry = renderChangelogEntry(diff);
  if (entry) updateChangelog(buildDir, entry);
  return { diff };
}

export async function buildCommand(options = {}) {
  console.log(chalk.cyan('\n⚙  Building design tokens...\n'));

  try {
    const result = await runBuild();

    console.log(chalk.green('\n✓ Build complete\n'));
    console.log('  ' + chalk.dim('design-system/build/css-vars.css'));
    console.log('  ' + chalk.dim('design-system/build/tailwind.tokens.cjs'));
    console.log('  ' + chalk.dim('design-system/build/tokens.js'));

    const diff = result.diff;
    if (diff) {
      const { added, removed, changed } = diff;
      if (added.length || removed.length || changed.length) {
        const parts = [
          changed.length && chalk.yellow(`${changed.length} changed`),
          added.length   && chalk.green(`${added.length} added`),
          removed.length && chalk.red(`${removed.length} removed`),
        ].filter(Boolean).join(', ');
        console.log('  ' + chalk.dim('design-system/build/CHANGELOG.md') + chalk.dim(` (${parts})`));
      } else {
        console.log('  ' + chalk.dim('No token changes since last build.'));
      }
    } else {
      console.log('  ' + chalk.dim('First build — snapshot saved for future diffs.'));
    }

    console.log();
  } catch (err) {
    console.error(chalk.red('\n✗ Build failed:\n'));
    console.error(err.message);
    process.exit(1);
  }
}
