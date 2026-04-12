import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '../../');

export async function initCommand() {
  const targetRoot = process.cwd();
  console.log(chalk.cyan('\n🚀 Initializing Design System Manager\n'));
  console.log(chalk.dim(`   Target: ${targetRoot}\n`));

  const steps = [
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
        const src = resolve(TEMPLATES_DIR, 'tokens.json');
        copyFileSync(src, dest);
      },
    },
    {
      label: 'design-system/components.json',
      run: () => {
        const dest = resolve(targetRoot, 'design-system/components.json');
        if (existsSync(dest)) return 'skipped (already exists)';
        const src = resolve(TEMPLATES_DIR, 'components.json');
        copyFileSync(src, dest);
      },
    },
    {
      label: 'design-system/style-dictionary.config.mjs',
      run: () => {
        const dest = resolve(targetRoot, 'design-system/style-dictionary.config.mjs');
        if (existsSync(dest)) return 'skipped (already exists)';
        const src = resolve(TEMPLATES_DIR, 'style-dictionary.config.mjs');
        copyFileSync(src, dest);
      },
    },
    {
      label: '.claude/commands/ directory',
      run: () => {
        const dir = resolve(targetRoot, '.claude/commands');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      },
    },
    {
      label: '.claude/commands/tokenize.md',
      run: () => {
        const dest = resolve(targetRoot, '.claude/commands/tokenize.md');
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
  ];

  for (const step of steps) {
    let status;
    try {
      status = step.run() ?? 'created';
    } catch (err) {
      status = chalk.red('failed: ' + err.message);
    }
    const icon = status?.startsWith('failed') ? '✗' : status === 'created' ? '✓' : '–';
    const color = status?.startsWith('failed') ? chalk.red : status === 'created' ? chalk.green : chalk.dim;
    console.log(`  ${color(icon)}  ${step.label}  ${chalk.dim(status)}`);
  }

  console.log(chalk.cyan('\n\nNext steps:\n'));
  console.log('  1. ' + chalk.white('cd design-system && npm install'));
  console.log('  2. ' + chalk.white('node src/cli.js build') + chalk.dim('  # compile tokens → CSS vars + Tailwind'));
  console.log('  3. ' + chalk.white('node src/cli.js generate-context') + chalk.dim('  # generate CLAUDE.md'));
  console.log('  4. ' + chalk.white('node src/cli.js scan ..') + chalk.dim('  # audit your existing codebase'));
  console.log();
}
