import { collectScanResults, printScanResults } from './scan.js';
import chalk from 'chalk';
import { collectConfigHealth } from '../utils/config-health.js';
import { resolveProjectPaths } from '../utils/paths.js';

export async function validateCommand(validatePath = '.', options = {}) {
  const shouldCheckConfig = Boolean(options.config || options.all);
  const shouldScanFiles = !options.config || options.all;
  const scanResults = shouldScanFiles ? await collectScanResults(validatePath) : null;
  const configResults = shouldCheckConfig
    ? await collectConfigHealth(resolveProjectPaths(process.cwd(), { allowMissingTokens: true }))
    : null;
  const totalErrors = scanResults?.totalErrors ?? 0;
  const totalFatalConfigIssues = configResults?.summary.fatal ?? 0;

  if (options.json) {
    console.log(JSON.stringify({
      scan: scanResults,
      config: configResults,
      ok: totalErrors === 0 && totalFatalConfigIssues === 0,
    }, null, 2));
  } else {
    if (scanResults) {
      printScanResults(scanResults, options);
    }

    if (configResults) {
      console.log(chalk.cyan('\n🧭 Config validation\n'));
      if (configResults.issues.length === 0) {
        console.log(chalk.green('  ✓ No DSM configuration issues found.\n'));
      } else {
        configResults.issues.forEach((issue) => {
          const icon = issue.severity === 'fatal' ? chalk.red('✗') : chalk.yellow('⚠');
          console.log(`  ${icon} ${issue.message}`);
        });
        console.log();
      }
    }
  }

  if (totalErrors > 0 || totalFatalConfigIssues > 0) {
    console.log(chalk.red(`\n✗ Validation failed — ${totalErrors} scan error${totalErrors !== 1 ? 's' : ''}, ${totalFatalConfigIssues} config fatal issue${totalFatalConfigIssues !== 1 ? 's' : ''}.\n`));
    process.exit(1);
  }

  console.log(chalk.green('\n✓ Validation passed.\n'));
}
