import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { buildCommand } from './build.js';
import { generateContextCommand } from './generate-context.js';
import { installHookCommand } from './install-hook.js';
import {
  createLocalCliWrapper,
  installPackageIntoProject,
  wireMcpServer,
  wirePackageScripts,
} from '../utils/project-install.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '../../');
const CLAUDE_COMMANDS_DIR = resolve(TEMPLATES_DIR, 'templates/claude-commands');

export async function initCommand(options = {}) {
  const targetRoot = process.cwd();
  let installedPackage = false;
  console.log(chalk.cyan('\n🚀 Initializing Design System Manager\n'));
  console.log(chalk.dim(`   Target: ${targetRoot}\n`));

  // ── Step 1: Scaffold files ─────────────────────────────────────────────
  const scaffoldSteps = [
    {
      label: 'design-system/ directory',
      run: () => {
        const dir = resolve(targetRoot, 'design-system');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const buildDir = resolve(dir, 'build');
        if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });
      },
    },
    {
      label: 'design-system/tokens.json',
      run: () => {
        const dest = resolve(targetRoot, 'design-system/tokens.json');
        if (existsSync(dest)) return 'skipped (already exists)';
        copyFileSync(resolve(TEMPLATES_DIR, 'tokens.json'), dest);
      },
    },
    {
      label: 'design-system/components.json',
      run: () => {
        const dest = resolve(targetRoot, 'design-system/components.json');
        if (existsSync(dest)) return 'skipped (already exists)';
        copyFileSync(resolve(TEMPLATES_DIR, 'components.json'), dest);
      },
    },
    {
      label: 'design-system/style-dictionary.config.mjs',
      run: () => {
        const dest = resolve(targetRoot, 'design-system/style-dictionary.config.mjs');
        if (existsSync(dest)) return 'skipped (already exists)';
        copyFileSync(resolve(TEMPLATES_DIR, 'style-dictionary.config.mjs'), dest);
      },
    },
    {
      label: 'design-system/package.json',
      run: () => {
        const dest = resolve(targetRoot, 'design-system/package.json');
        if (existsSync(dest)) return 'skipped (already exists)';
        writeFileSync(dest, JSON.stringify({ type: 'module' }, null, 2) + '\n', 'utf8');
      },
    },
    {
      label: '.claude/commands/tokenize.md',
      run: () => {
        const dir  = resolve(targetRoot, '.claude/commands');
        const dest = resolve(dir, 'tokenize.md');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        if (existsSync(dest)) return 'skipped (already exists)';
        const src = resolve(CLAUDE_COMMANDS_DIR, 'tokenize.md');
        if (existsSync(src)) copyFileSync(src, dest);
      },
    },
    {
      label: '.claude/commands/new-component.md',
      run: () => {
        const dest = resolve(targetRoot, '.claude/commands/new-component.md');
        if (existsSync(dest)) return 'skipped (already exists)';
        const src = resolve(CLAUDE_COMMANDS_DIR, 'new-component.md');
        if (existsSync(src)) copyFileSync(src, dest);
      },
    },
    {
      label: '.claude/commands/audit-component.md',
      run: () => {
        const dest = resolve(targetRoot, '.claude/commands/audit-component.md');
        if (existsSync(dest)) return 'skipped (already exists)';
        const src = resolve(CLAUDE_COMMANDS_DIR, 'audit-component.md');
        if (existsSync(src)) copyFileSync(src, dest);
      },
    },
    {
      label: '.claude/settings.json (MCP server)',
      run: () => 'pending',
    },
    {
      label: 'design-system/bin/dsm.js',
      run: () => {
        const cliPath = resolve(TEMPLATES_DIR, 'src/cli.js');
        createLocalCliWrapper(targetRoot, cliPath);
      },
    },
    {
      label: 'package.json scripts',
      run: () => 'pending',
    },
  ];

  for (const step of scaffoldSteps) {
    let status;
    try {
      status = step.run() ?? 'created';
    } catch (err) {
      status = 'failed: ' + err.message;
    }
    const icon  = status?.startsWith('failed') ? '✗' : status === 'created' ? '✓' : '–';
    const color = status?.startsWith('failed') ? chalk.red : status === 'created' ? chalk.green : chalk.dim;
    console.log(`  ${color(icon)}  ${step.label}  ${chalk.dim(status)}`);
  }

  if (!options.skipInstall) {
    console.log(chalk.cyan('\n📦 Installing DSM package...\n'));
    try {
      const { status, installed } = await installPackageIntoProject(targetRoot, TEMPLATES_DIR);
      installedPackage = installed === true;
      const icon = installedPackage ? chalk.green('✓') : chalk.dim('–');
      console.log(`  ${icon}  ${chalk.white('dev dependency')}  ${chalk.dim(status)}`);
    } catch (err) {
      console.log(`  ${chalk.yellow('⚠')}  ${chalk.white('dev dependency')}  ${chalk.dim(`install failed: ${err.message}`)}`);
      console.log(chalk.dim('     Falling back to the local wrapper scripts for this project.\n'));
    }
  } else {
    console.log(chalk.dim('\n📦 Skipping DSM package install (--skip-install)\n'));
  }

  const scriptStatus = wirePackageScripts(targetRoot, { preferInstalledBinary: installedPackage });
  const scriptIcon = scriptStatus?.startsWith('failed') ? chalk.red('✗') : scriptStatus === 'updated' ? chalk.green('✓') : chalk.dim('–');
  console.log(`  ${scriptIcon}  ${chalk.white('package.json scripts')}  ${chalk.dim(scriptStatus)}`);

  const mcpStatus = installedPackage
    ? wireMcpServer(targetRoot, 'node', ['./node_modules/dsm/src/cli.js', 'serve'])
    : wireMcpServer(targetRoot, 'node', ['./design-system/bin/dsm.js', 'serve']);
  const mcpIcon = mcpStatus?.startsWith('failed') ? chalk.red('✗') : mcpStatus === 'updated' ? chalk.green('✓') : chalk.dim('–');
  console.log(`  ${mcpIcon}  ${chalk.white('.claude/settings.json (MCP server)')}  ${chalk.dim(mcpStatus)}`);

  // ── Step 2: Build tokens ───────────────────────────────────────────────
  console.log(chalk.cyan('\n⚙  Building tokens...\n'));
  try {
    await buildCommand();
  } catch (error) {
    console.log(chalk.yellow(`  ⚠  Build skipped — ${error.message}`));
    console.log(chalk.dim('     Run `dsm build` manually after setup.\n'));
  }

  // ── Step 3: Generate CLAUDE.md + AGENTS.md ────────────────────────────
  console.log(chalk.cyan('📝 Generating context files...\n'));
  try {
    await generateContextCommand();
  } catch (error) {
    console.log(chalk.yellow(`  ⚠  Context generation skipped — ${error.message}`));
    console.log(chalk.dim('     Run `dsm generate-context` manually.\n'));
  }

  // ── Step 4: Install pre-commit hook (unless --skip-hook) ──────────────
  if (!options.skipHook) {
    console.log(chalk.cyan('🔗 Installing pre-commit hook...\n'));
    try {
      await installHookCommand({ force: false });
    } catch {
      console.log(chalk.yellow('  ⚠  Hook install skipped — not a git repo or hook already exists.'));
      console.log(chalk.dim('     Run `dsm install-hook` manually, or use --force to append.\n'));
    }
  }

  // ── Done ───────────────────────────────────────────────────────────���───
  console.log(chalk.green('\n✓ Design System Manager is ready.\n'));
  console.log(chalk.dim('  What you have now:'));
  console.log(chalk.dim('    design-system/tokens.json       — edit your tokens here'));
  console.log(chalk.dim('    design-system/components.json   — register UI components here'));
  console.log(chalk.dim('    design-system/build/            — generated CSS vars + Tailwind config'));
  console.log(chalk.dim('    CLAUDE.md / AGENTS.md           — AI agent rules (auto-updated on build)'));
  console.log(chalk.dim('    .claude/settings.json           — MCP server wired for Claude Code'));
  console.log(chalk.dim('    design-system/bin/dsm.js        — project-local DSM wrapper for agents/hooks'));
  console.log(chalk.dim('    design-system/vendor/*.tgz      — installable DSM package tarball'));
  console.log();
  console.log(chalk.dim('  Useful commands:'));
  console.log('    ' + chalk.white(installedPackage ? 'npx dsm build' : 'node design-system/bin/dsm.js build') + chalk.dim('   — rebuild tokens after editing tokens.json'));
  console.log('    ' + chalk.white('npm run dsm:validate') + chalk.dim('           — check the whole repo for violations'));
  console.log('    ' + chalk.white('npm run dsm:scan') + chalk.dim('               — scan the whole repo for hardcoded values'));
  console.log('    ' + chalk.white(installedPackage ? 'npx dsm get-token <query>' : 'node design-system/bin/dsm.js get-token <query>') + chalk.dim(' — look up a token'));
  console.log();
}
