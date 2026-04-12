#!/usr/bin/env node
import { Command } from 'commander';
import { buildCommand } from './commands/build.js';
import { generateContextCommand } from './commands/generate-context.js';
import { initCommand } from './commands/init.js';
import { installHookCommand } from './commands/install-hook.js';
import { scanCommand } from './commands/scan.js';
import { serveCommand } from './commands/serve.js';
import { validateCommand } from './commands/validate.js';
import { watchCommand } from './commands/watch.js';

const program = new Command();

program
  .name('dsm')
  .description('Design System Manager — tokenize, build, and enforce your design system')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize design system config in the current project')
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
  .action(validateCommand);

program
  .command('serve')
  .description('Start the MCP server (stdio) exposing get_token, list_components, validate_file')
  .action(serveCommand);

program
  .command('install-hook')
  .description('Install a pre-commit git hook that runs dsm validate before each commit')
  .option('--force', 'Append dsm block to an existing pre-commit hook instead of aborting')
  .action(installHookCommand);

program.parse();
