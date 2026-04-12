import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { buildCommand } from './build.js';
import { generateContextCommand } from './generate-context.js';
import { installHookCommand } from './install-hook.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '../../');

/** Read .claude/settings.json, merge in the dsm MCP server entry, write back. */
function wireMcpServer(targetRoot, cliPath) {
  const settingsDir = resolve(targetRoot, '.claude');
  const settingsPath = resolve(settingsDir, 'settings.json');

  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });

  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { /* keep empty */ }
  }

  settings.mcpServers ??= {};
  if (settings.mcpServers.dsm) return 'skipped (already registered)';

  settings.mcpServers.dsm = {
    command: 'node',
    args: [cliPath, 'serve'],
    cwd: targetRoot,
  };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

export async function initCommand(options = {}) {
  const targetRoot = process.cwd();
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
        const src = resolve(TEMPLATES_DIR, '../.claude/commands/tokenize.md');
        if (existsSync(src)) copyFileSync(src, dest);
      },
    },
    {
      label: '.claude/commands/new-component.md',
      run: () => {
        const dest = resolve(targetRoot, '.claude/commands/new-component.md');
        if (existsSync(dest)) return 'skipped (already exists)';
        const src = resolve(TEMPLATES_DIR, '../.claude/commands/new-component.md');
        if (existsSync(src)) copyFileSync(src, dest);
      },
    },
    {
      label: '.claude/commands/audit-component.md',
      run: () => {
        const dest = resolve(targetRoot, '.claude/commands/audit-component.md');
        if (existsSync(dest)) return 'skipped (already exists)';
        const src = resolve(TEMPLATES_DIR, '../.claude/commands/audit-component.md');
        if (existsSync(src)) copyFileSync(src, dest);
      },
    },
    {
      label: '.claude/settings.json (MCP server)',
      run: () => {
        const cliPath = resolve(TEMPLATES_DIR, 'src/cli.js');
        return wireMcpServer(targetRoot, cliPath);
      },
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

  // ── Step 2: Build tokens ───────────────────────────────────────────────
  console.log(chalk.cyan('\n⚙  Building tokens...\n'));
  try {
    await buildCommand();
  } catch {
    console.log(chalk.yellow('  ⚠  Build skipped — run `dsm build` manually after setup.\n'));
  }

  // ── Step 3: Generate CLAUDE.md + AGENTS.md ────────────────────────────
  console.log(chalk.cyan('📝 Generating context files...\n'));
  try {
    await generateContextCommand();
  } catch {
    console.log(chalk.yellow('  ⚠  Context generation skipped — run `dsm generate-context` manually.\n'));
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
  console.log();
  console.log(chalk.dim('  Useful commands:'));
  console.log('    ' + chalk.white('dsm build') + chalk.dim('                  — rebuild tokens after editing tokens.json'));
  console.log('    ' + chalk.white('dsm watch') + chalk.dim('                  — rebuild + regenerate on every save'));
  console.log('    ' + chalk.white('dsm get-token <query>') + chalk.dim('      — look up a token'));
  console.log('    ' + chalk.white('dsm validate [path]') + chalk.dim('        — check for design system violations'));
  console.log('    ' + chalk.white('dsm scan [path] --fix') + chalk.dim('      — auto-replace hardcoded values'));
  console.log();
}
