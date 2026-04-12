import { scanCommand, collectScanResults } from './scan.js';
import chalk from 'chalk';

export async function validateCommand(validatePath = '.', options = {}) {
  const { totalErrors } = await collectScanResults(validatePath);

  await scanCommand(validatePath, options);

  if (totalErrors > 0) {
    console.log(chalk.red(`\n✗ Validation failed — ${totalErrors} error${totalErrors !== 1 ? 's' : ''} found.\n`));
    process.exit(1);
  } else {
    console.log(chalk.green('\n✓ Validation passed.\n'));
  }
}
