import { existsSync, readFileSync } from 'fs';
import chalk from 'chalk';
import { resolveProjectPaths } from '../utils/paths.js';

/**
 * Pure data access — no I/O. Returns filtered components array.
 */
export function getComponents(componentsPath, filter) {
  if (!existsSync(componentsPath)) return null;
  const registry = JSON.parse(readFileSync(componentsPath, 'utf8'));
  let components = registry.components ?? [];
  if (filter) {
    const f = filter.toLowerCase();
    components = components.filter(c => c.name.toLowerCase().includes(f));
  }
  return components;
}

export async function listComponentsCommand(options = {}) {
  const { componentsPath } = resolveProjectPaths();
  const components = getComponents(componentsPath, options.filter);

  if (components === null) {
    console.log(chalk.yellow('\nNo components.json found.\n'));
    return;
  }

  if (components.length === 0) {
    console.log(chalk.yellow('\nNo components found.\n'));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(components, null, 2));
    return;
  }

  console.log(chalk.cyan(`\n${components.length} component${components.length !== 1 ? 's' : ''}:\n`));
  for (const c of components) {
    const variants = c.variants?.join(', ') ?? 'n/a';
    console.log(`  ${chalk.bold(chalk.white(`<${c.name}>`))}  ${chalk.dim(c.path)}`);
    if (c.description) console.log(`    ${chalk.dim(c.description)}`);
    console.log(`    ${chalk.dim('Variants:')} ${variants}`);
    console.log();
  }
}
