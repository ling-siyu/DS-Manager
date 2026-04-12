import chokidar from 'chokidar';
import chalk from 'chalk';
import { buildCommand } from './build.js';
import { generateContextCommand } from './generate-context.js';
import { resolveProjectPaths } from '../utils/paths.js';

export async function watchCommand() {
  const { tokensPath, componentsPath } = resolveProjectPaths();

  console.log(chalk.cyan('\n👁  Watching design system files...\n'));
  console.log(chalk.dim(`  ${tokensPath}`));
  console.log(chalk.dim(`  ${componentsPath}`));
  console.log(chalk.dim('\nPress Ctrl+C to stop.\n'));

  // Initial build + context generation
  await buildCommand();
  await generateContextCommand();

  const watcher = chokidar.watch([tokensPath, componentsPath], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  watcher.on('change', async (filePath) => {
    const name = filePath.split('/').pop();
    console.log(chalk.yellow(`\n↻  ${name} changed — rebuilding...`));
    await buildCommand();
    await generateContextCommand();
  });

  watcher.on('error', (err) => {
    console.error(chalk.red('Watch error:'), err.message);
  });
}
