import { glob } from 'glob';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';

// Patterns that indicate hardcoded values instead of design tokens
const VIOLATION_PATTERNS = [
  {
    id: 'hex-color',
    label: 'Hardcoded hex color',
    // Match hex colors but not inside CSS variable definitions (--var: #xxx is allowed)
    regex: /(?<!--[\w-]+:\s*)(?<!['"`(])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
    severity: 'error',
  },
  {
    id: 'rgb-color',
    label: 'Hardcoded rgb/rgba color',
    regex: /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g,
    severity: 'error',
  },
  {
    id: 'hsl-color',
    label: 'Hardcoded hsl/hsla color',
    regex: /hsla?\(\s*\d+/g,
    severity: 'error',
  },
  {
    id: 'arbitrary-color',
    label: 'Arbitrary Tailwind color (use semantic token class instead)',
    regex: /(?:text|bg|border|fill|stroke|shadow|ring|outline|caret|accent|decoration)-\[#[0-9a-fA-F]/g,
    severity: 'error',
  },
  {
    id: 'arbitrary-spacing',
    label: 'Arbitrary Tailwind spacing (use spacing token class instead)',
    regex: /(?:p|m|gap|space|inset|top|right|bottom|left|w|h|min-w|max-w|min-h|max-h)-\[\d+(?:px|rem|em)\]/g,
    severity: 'warning',
  },
  {
    id: 'arbitrary-font-size',
    label: 'Arbitrary Tailwind font size',
    regex: /text-\[\d+(?:px|rem|em)\]/g,
    severity: 'warning',
  },
  {
    id: 'inline-style',
    label: 'Inline style attribute (prefer token-based classes)',
    regex: /style=\{?\s*\{[^}]+color\s*:/g,
    severity: 'warning',
  },
];

const EXTENSIONS = ['tsx', 'jsx', 'ts', 'js', 'css', 'scss'];
const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/design-system/build/**',
  '**/.next/**',
  '**/dist/**',
  '**/.git/**',
];

function shouldIgnorePath(filePath) {
  return [
    '/node_modules/',
    '/design-system/build/',
    '/.next/',
    '/dist/',
    '/.git/',
  ].some((segment) => filePath.includes(segment));
}

export async function collectScanResults(scanPath = '.') {
  const absolutePath = resolve(process.cwd(), scanPath);
  const pattern = `${absolutePath}/**/*.{${EXTENSIONS.join(',')}}`;
  const files = (await glob(pattern, {
    ignore: IGNORE_GLOBS,
  })).filter((filePath) => !shouldIgnorePath(filePath));

  if (files.length === 0) {
    return {
      absolutePath,
      files,
      totalErrors: 0,
      totalWarnings: 0,
      results: [],
    };
  }

  const results = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const filePath of files.sort()) {
    let source;
    try {
      source = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = source.split('\n');
    const fileViolations = [];

    for (const pattern of VIOLATION_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, 'g');
      let match;

      while ((match = regex.exec(source)) !== null) {
        // Find line number
        const lineIndex = source.substring(0, match.index).split('\n').length - 1;
        const lineContent = lines[lineIndex]?.trim() ?? '';

        fileViolations.push({
          patternId: pattern.id,
          label: pattern.label,
          severity: pattern.severity,
          match: match[0],
          line: lineIndex + 1,
          lineContent,
        });

        if (pattern.severity === 'error') totalErrors++;
        else totalWarnings++;
      }
    }

    if (fileViolations.length > 0) {
      const relativePath = filePath.replace(absolutePath + '/', '');
      results.push({ file: relativePath, violations: fileViolations });
    }
  }

  return { absolutePath, files, totalErrors, totalWarnings, results };
}

export async function scanCommand(scanPath = '.', options = {}) {
  const { absolutePath, files, totalErrors, totalWarnings, results } = await collectScanResults(scanPath);

  console.log(chalk.cyan(`\n🔍 Scanning ${absolutePath}\n`));

  if (files.length === 0) {
    console.log(chalk.yellow('No files found to scan.\n'));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({ totalErrors, totalWarnings, files: results }, null, 2));
    return;
  }

  // Human-readable output
  if (results.length === 0) {
    console.log(chalk.green('✓ No violations found across ' + files.length + ' files.\n'));
    return;
  }

  for (const { file, violations } of results) {
    console.log(chalk.bold(chalk.white(file)));
    for (const v of violations) {
      const icon = v.severity === 'error' ? chalk.red('  ✗') : chalk.yellow('  ⚠');
      const line = chalk.dim(`line ${v.line}`);
      console.log(`${icon} ${line}  ${chalk.dim(v.label)}`);
      console.log(`     ${chalk.dim('found:')} ${chalk.white(v.match)}`);
    }
    console.log();
  }

  const errorText  = chalk.red(`${totalErrors} error${totalErrors !== 1 ? 's' : ''}`);
  const warnText   = chalk.yellow(`${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}`);
  const fileText   = `across ${results.length} file${results.length !== 1 ? 's' : ''}`;
  console.log(`Summary: ${errorText}, ${warnText} ${fileText}\n`);

  console.log(chalk.dim('Tip: Replace hardcoded values with CSS variables from design-system/build/css-vars.css'));
  console.log(chalk.dim('     or use the /tokenize Claude Code command to auto-replace.\n'));
}
