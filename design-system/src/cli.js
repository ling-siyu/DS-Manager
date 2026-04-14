#!/usr/bin/env node
import { basename, resolve } from 'path';
import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { buildCommand } from './commands/build.js';
import { doctorCommand } from './commands/doctor.js';
import { generateContextCommand } from './commands/generate-context.js';
import { getTokenCommand } from './commands/get-token.js';
import { initCommand } from './commands/init.js';
import { installHookCommand } from './commands/install-hook.js';
import { listComponentsCommand } from './commands/list-components.js';
import { scanCommand } from './commands/scan.js';
import { serveCommand } from './commands/serve.js';
import { syncComponentsCommand } from './commands/sync-components.js';
import { uiCommand } from './commands/ui.js';
import { updateCommand } from './commands/update.js';
import { validateCommand } from './commands/validate.js';
import { watchCommand } from './commands/watch.js';
import { getDsmVersion } from './utils/metadata.js';

const program = new Command();

program
  .name('dsm')
  .description('Design System Manager — tokenize, build, and enforce your design system')
  .version(getDsmVersion());

program
  .command('init')
  .description('Initialize design system config in the current project')
  .option('--skip-hook', 'Skip installing the pre-commit git hook')
  .option('--skip-install', 'Skip installing DSM as a dev dependency in the current project')
  .action(initCommand);

program
  .command('build')
  .description('Compile tokens.json → CSS variables + Tailwind config')
  .option('--verbose', 'Show detailed output')
  .action(buildCommand);

program
  .command('watch')
  .description('Watch tokens.json and rebuild on change')
  .action(watchCommand);

program
  .command('generate-context')
  .description('Regenerate CLAUDE.md and design-system/context.md from tokens and components')
  .action(generateContextCommand);

program
  .command('scan [path]')
  .description('Scan codebase for hardcoded values not referencing design tokens')
  .option('-f, --fix', 'Attempt to auto-replace matched values with token CSS variables')
  .option('--json', 'Output results as JSON')
  .action(scanCommand);

program
  .command('validate [path]')
  .description('Validate files for design system compliance (exit 1 if violations found)')
  .option('--json', 'Output results as JSON')
  .option('--config', 'Only validate DSM configuration and project wiring')
  .option('--all', 'Validate both scanned files and DSM configuration')
  .action(validateCommand);

program
  .command('doctor')
  .description('Check DSM configuration, registry health, generated files, and project wiring')
  .option('--json', 'Output as JSON')
  .action(doctorCommand);

program
  .command('get-token <query>')
  .description('Look up a design token by path, CSS variable, or partial name')
  .option('--json', 'Output as JSON')
  .action((query, options) => getTokenCommand(query, options));

program
  .command('list-components')
  .description('List registered design system components')
  .option('--filter <name>', 'Filter by component name')
  .option('--json', 'Output as JSON')
  .action(listComponentsCommand);

program
  .command('serve')
  .description('Start the MCP server (stdio) exposing get_token, list_components, validate_file')
  .action(serveCommand);

program
  .command('install-hook')
  .description('Install a pre-commit git hook that runs dsm validate before each commit')
  .option('--force', 'Append dsm block to an existing pre-commit hook instead of aborting')
  .action(installHookCommand);

program
  .command('update')
  .description('Refresh the current project from the DSM source checkout used to run this command')
  .option('--skip-build', 'Skip rebuilding tokens and regenerating context files after updating DSM')
  .action(updateCommand);

program
  .command('sync-components')
  .description('Discover React components from the codebase and compare or sync components.json')
  .option('--json', 'Output as JSON')
  .option('--check', 'Show drift only and exit nonzero when the registry is out of sync')
  .option('--write', 'Write the updated registry back to design-system/components.json')
  .option('--merge', 'Preserve manual metadata where possible when writing')
  .action(syncComponentsCommand);

program
  .command('ui')
  .description('Start a local design system preview server for designers')
  .option('-p, --port <number>', 'Port to listen on', '7777')
  .option('--no-open', 'Do not automatically open the browser')
  .action(uiCommand);

export async function main(argv = process.argv.slice(2)) {
  await program.parseAsync(argv, { from: 'user' });
}

function isDirectInvocation(argvPath) {
  if (!argvPath) return false;
  const modulePath = fileURLToPath(import.meta.url);

  try {
    return realpathSync(resolve(argvPath)) === realpathSync(modulePath);
  } catch {
    return resolve(argvPath) === modulePath
      || basename(argvPath) === 'dsm'
      || basename(argvPath) === 'dsm.cmd';
  }
}

if (isDirectInvocation(process.argv[1])) {
  main().catch((error) => {
    console.error(error.stack || String(error));
    process.exit(1);
  });
}
