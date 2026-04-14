import chalk from 'chalk';
import { collectConfigHealth } from '../utils/config-health.js';
import { resolveProjectPaths } from '../utils/paths.js';

function renderIssue(issue) {
  const icon = issue.severity === 'fatal'
    ? chalk.red('✗')
    : issue.severity === 'warning'
      ? chalk.yellow('⚠')
      : chalk.cyan('•');

  console.log(`  ${icon} ${issue.message}`);
}

export async function doctorCommand(options = {}) {
  const paths = resolveProjectPaths(process.cwd(), { allowMissingTokens: true });
  const health = await collectConfigHealth(paths);

  if (options.json) {
    console.log(JSON.stringify(health, null, 2));
  } else {
    console.log(chalk.cyan('\n🩺 DSM Doctor\n'));
    console.log(chalk.dim(`  Project: ${paths.repoRoot}`));
    console.log(chalk.dim(`  Design system: ${paths.dsRoot}\n`));

    if (health.issues.length === 0) {
      console.log(chalk.green('  ✓ No DSM configuration issues found.\n'));
    } else {
      health.issues.forEach(renderIssue);
      console.log();
    }

    const fatalText = health.summary.fatal
      ? chalk.red(`${health.summary.fatal} fatal`)
      : chalk.green('0 fatal');
    const warningText = health.summary.warning
      ? chalk.yellow(`${health.summary.warning} warning`)
      : chalk.green('0 warning');

    console.log(`  Summary: ${fatalText}, ${warningText}\n`);
  }

  if (!health.ok) {
    process.exit(1);
  }
}
