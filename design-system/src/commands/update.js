import chalk from 'chalk';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildCommand } from './build.js';
import { generateContextCommand } from './generate-context.js';
import {
  createLocalCliWrapper,
  wireMcpServer,
  wirePackageScripts,
} from '../utils/project-install.js';
import { getDsmVersion } from '../utils/metadata.js';
import { refreshInstalledDsm } from '../utils/update-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_SOURCE_ROOT = resolve(__dirname, '../../');

export async function updateCommand(options = {}) {
  const targetRoot = process.cwd();
  let installedPackage = false;
  let verificationMessage = null;

  console.log(chalk.cyan(`\n🔄 Updating Design System Manager v${getDsmVersion()}\n`));
  console.log(chalk.dim(`   Target: ${targetRoot}\n`));

  createLocalCliWrapper(targetRoot, resolve(PACKAGE_SOURCE_ROOT, 'src/cli.js'));
  console.log(`  ${chalk.green('✓')}  ${chalk.white('design-system/bin/dsm.js')}  ${chalk.dim('updated')}`);

  console.log(chalk.cyan('\n📦 Refreshing DSM package...\n'));
  try {
    const updateResult = await refreshInstalledDsm(targetRoot, PACKAGE_SOURCE_ROOT, {
      logger(step, status, details) {
        const icon = status === 'done' ? chalk.green('✓') : chalk.cyan('…');
        console.log(`  ${icon}  ${chalk.white(step)}${details ? `  ${chalk.dim(details)}` : ''}`);
      },
    });

    installedPackage = updateResult.ok;
    verificationMessage = updateResult.verification?.command
      ? `${updateResult.verification.command} -> ${updateResult.verification.output}`
      : null;
  } catch (err) {
    console.log(`  ${chalk.red('✗')}  ${chalk.white('install verification')}  ${chalk.dim(err.message)}`);
    console.log(chalk.dim('     Keeping the project-local wrapper so DSM commands still work.\n'));
  }

  console.log(`  ${(installedPackage ? chalk.green('✓') : chalk.dim('–'))}  ${chalk.white('verify installed CLI')}  ${chalk.dim(verificationMessage || 'wrapper fallback remains active')}`);

  console.log(`  ${chalk.cyan('…')}  ${chalk.white('update scripts')}`);
  const scriptStatus = wirePackageScripts(targetRoot, { preferInstalledBinary: installedPackage });
  const scriptIcon = scriptStatus?.startsWith('failed') ? chalk.red('✗') : scriptStatus === 'updated' ? chalk.green('✓') : chalk.dim('–');
  console.log(`  ${scriptIcon}  ${chalk.white('package.json scripts')}  ${chalk.dim(scriptStatus)}`);

  console.log(`  ${chalk.cyan('…')}  ${chalk.white('update MCP wiring')}`);
  const mcpStatus = installedPackage
    ? wireMcpServer(targetRoot, 'node', ['./node_modules/dsm/src/cli.js', 'serve'])
    : wireMcpServer(targetRoot, 'node', ['./design-system/bin/dsm.js', 'serve']);
  const mcpIcon = mcpStatus?.startsWith('failed') ? chalk.red('✗') : mcpStatus === 'updated' ? chalk.green('✓') : chalk.dim('–');
  console.log(`  ${mcpIcon}  ${chalk.white('.claude/settings.json (MCP server)')}  ${chalk.dim(mcpStatus)}`);

  if (!options.skipBuild) {
    console.log(chalk.cyan('\n⚙  Rebuilding generated artifacts...\n'));
    try {
      await buildCommand();
    } catch (error) {
      console.log(chalk.yellow(`  ⚠  Build skipped — ${error.message}`));
      console.log(chalk.dim('     Run `dsm build` manually if this project is only partially initialized.\n'));
    }

    console.log(chalk.cyan('📝 Regenerating context files...\n'));
    try {
      await generateContextCommand();
    } catch (error) {
      console.log(chalk.yellow(`  ⚠  Context generation skipped — ${error.message}`));
      console.log(chalk.dim('     Run `dsm generate-context` manually if needed.\n'));
    }
  } else {
    console.log(chalk.dim('\n⚙  Skipping build + context refresh (--skip-build)\n'));
  }

  if (!installedPackage) {
    console.log(chalk.red('\n✗ DSM update finished in recovery mode.\n'));
    process.exit(1);
  }

  console.log(chalk.green('\n✓ DSM update complete.\n'));
  console.log(chalk.dim('  Useful commands:'));
  console.log(`    ${chalk.white('npm run dsm:update')} ${chalk.dim('          — refresh this project from your current DSM checkout')}`);
  console.log(`    ${chalk.white(installedPackage ? 'npx dsm --version' : 'node design-system/bin/dsm.js --version')} ${chalk.dim('— confirm the installed CLI version')}`);
  console.log();
}
