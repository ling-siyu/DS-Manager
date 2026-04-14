import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, chmodSync, readdirSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import { buildCommand } from './build.js';
import { generateContextCommand } from './generate-context.js';
import { installHookCommand } from './install-hook.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '../../');
const CLAUDE_COMMANDS_DIR = resolve(TEMPLATES_DIR, 'templates/claude-commands');

/** Read .claude/settings.json, merge in the dsm MCP server entry, write back. */
function wireMcpServer(targetRoot, command, args) {
  const settingsDir = resolve(targetRoot, '.claude');
  const settingsPath = resolve(settingsDir, 'settings.json');

  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });

  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { /* keep empty */ }
  }

  settings.mcpServers ??= {};

  settings.mcpServers.dsm = {
    command,
    args,
    cwd: targetRoot,
  };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return 'updated';
}

function createLocalCliWrapper(targetRoot, cliPath) {
  const binDir = resolve(targetRoot, 'design-system/bin');
  const wrapperPath = resolve(binDir, 'dsm.js');

  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

  const wrapperSource = `#!/usr/bin/env node
import { main } from ${JSON.stringify(cliPath)};
try {
  await main(process.argv.slice(2));
} catch (err) {
  console.error(err.stack || String(err));
  process.exitCode = 1;
}
`;

  writeFileSync(wrapperPath, wrapperSource, 'utf8');
  chmodSync(wrapperPath, 0o755);
}

function wirePackageScripts(targetRoot, options = {}) {
  const packagePath = resolve(targetRoot, 'package.json');
  if (!existsSync(packagePath)) return 'skipped (no package.json at project root)';

  const { preferInstalledBinary = false } = options;

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch (err) {
    return `failed: could not parse package.json (${err.message})`;
  }

  pkg.scripts ??= {};

  const cliPrefix = preferInstalledBinary ? 'dsm' : 'node design-system/bin/dsm.js';
  const legacyCliPrefix = 'node design-system/bin/dsm.js';

  const desiredScripts = {
    dsm: cliPrefix,
    'dsm:build': `${cliPrefix} build`,
    'dsm:watch': `${cliPrefix} watch`,
    'dsm:scan': `${cliPrefix} scan .`,
    'dsm:validate': `${cliPrefix} validate .`,
    'dsm:generate-context': `${cliPrefix} generate-context`,
  };

  let changed = false;
  for (const [name, command] of Object.entries(desiredScripts)) {
    const current = pkg.scripts[name];
    const legacyCommand = name === 'dsm' ? legacyCliPrefix : `${legacyCliPrefix}${command.slice(cliPrefix.length)}`;

    if (current == null) {
      pkg.scripts[name] = command;
      changed = true;
      continue;
    }

    if (preferInstalledBinary && current === legacyCommand) {
      pkg.scripts[name] = command;
      changed = true;
    }
  }

  if (!changed) return 'skipped (scripts already exist)';

  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return 'updated';
}

function detectPackageManager(targetRoot) {
  if (existsSync(resolve(targetRoot, 'pnpm-lock.yaml'))) {
    return { name: 'pnpm', cmd: 'pnpm', args: ['add', '-D'] };
  }

  if (existsSync(resolve(targetRoot, 'yarn.lock'))) {
    return { name: 'yarn', cmd: 'yarn', args: ['add', '-D'] };
  }

  if (existsSync(resolve(targetRoot, 'bun.lock')) || existsSync(resolve(targetRoot, 'bun.lockb'))) {
    return { name: 'bun', cmd: 'bun', args: ['add', '-d'] };
  }

  return { name: 'npm', cmd: 'npm', args: ['install', '-D'] };
}

function installPackageIntoProject(targetRoot) {
  const packagePath = resolve(targetRoot, 'package.json');
  if (!existsSync(packagePath)) return 'skipped (no package.json at project root)';

  const vendorDir = resolve(targetRoot, 'design-system/vendor');
  const npmCacheDir = resolve(targetRoot, 'design-system/.npm-cache');
  if (!existsSync(vendorDir)) mkdirSync(vendorDir, { recursive: true });
  if (!existsSync(npmCacheDir)) mkdirSync(npmCacheDir, { recursive: true });

  const npmEnv = { ...process.env, npm_config_cache: npmCacheDir };

  for (const file of readdirSync(vendorDir)) {
    if (file.startsWith('dsm-') && file.endsWith('.tgz')) {
      unlinkSync(resolve(vendorDir, file));
    }
  }

  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', vendorDir],
    { cwd: TEMPLATES_DIR, encoding: 'utf8', env: npmEnv },
  );
  let packedFilename;
  try {
    packedFilename = JSON.parse(packOutput)[0]?.filename;
  } catch {
    packedFilename = packOutput.trim().split('\n').pop();
  }

  if (!packedFilename) {
    throw new Error('npm pack did not produce a tarball');
  }

  const packageManager = detectPackageManager(targetRoot);
  const packageSpec = `./design-system/vendor/${packedFilename}`;

  execFileSync(
    packageManager.cmd,
    [...packageManager.args, packageSpec],
    {
      cwd: targetRoot,
      stdio: 'inherit',
      env: packageManager.name === 'npm' ? npmEnv : process.env,
    },
  );

  return `installed via ${packageManager.name}`;
}

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
      const status = installPackageIntoProject(targetRoot);
      installedPackage = true;
      console.log(`  ${chalk.green('✓')}  ${chalk.white('dev dependency')}  ${chalk.dim(status)}`);
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
