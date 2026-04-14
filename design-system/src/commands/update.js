import chalk from 'chalk';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildCommand } from './build.js';
import { generateContextCommand } from './generate-context.js';
import {
  createLocalCliWrapper,
  installPackageIntoProject,
  wireMcpServer,
  wirePackageScripts,
} from '../utils/project-install.js';
import { getDsmVersion } from '../utils/metadata.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_SOURCE_ROOT = resolve(__dirname, '../../');

export async function updateCommand(options = {}) {
  const targetRoot = process.cwd();
  let installedPackage = false;

  console.log(chalk.cyan(`\n🔄 Updating Design System Manager v${getDsmVersion()}\n`));
  console.log(chalk.dim(`   Target: ${targetRoot}\n`));

  createLocalCliWrapper(targetRoot, resolve(PACKAGE_SOURCE_ROOT, 'src/cli.js'));
  console.log(`  ${chalk.green('✓')}  ${chalk.white('design-system/bin/dsm.js')}  ${chalk.dim('updated')}`);

  console.log(chalk.cyan('\n📦 Refreshing DSM package...\n'));
  try {
    const { status, tarballPath, installed } = await installPackageIntoProject(targetRoot, PACKAGE_SOURCE_ROOT);
    installedPackage = installed === true;
    const icon = installedPackage ? chalk.green('✓') : chalk.dim('–');
    console.log(`  ${icon}  ${chalk.white('dev dependency')}  ${chalk.dim(status)}`);
    if (tarballPath) {
      console.log(`  ${chalk.green('✓')}  ${chalk.white('vendor tarball')}  ${chalk.dim(tarballPath)}`);
    }
  } catch (err) {
    console.log(`  ${chalk.yellow('⚠')}  ${chalk.white('dev dependency')}  ${chalk.dim(`update failed: ${err.message}`)}`);
    console.log(chalk.dim('     Keeping the project-local wrapper so DSM commands still work.\n'));
  }

  const scriptStatus = wirePackageScripts(targetRoot, { preferInstalledBinary: installedPackage });
  const scriptIcon = scriptStatus?.startsWith('failed') ? chalk.red('✗') : scriptStatus === 'updated' ? chalk.green('✓') : chalk.dim('–');
  console.log(`  ${scriptIcon}  ${chalk.white('package.json scripts')}  ${chalk.dim(scriptStatus)}`);

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

  console.log(chalk.green('\n✓ DSM update complete.\n'));
  console.log(chalk.dim('  Useful commands:'));
  console.log(`    ${chalk.white('npm run dsm:update')} ${chalk.dim('          — refresh this project from your current DSM checkout')}`);
  console.log(`    ${chalk.white(installedPackage ? 'npx dsm --version' : 'node design-system/bin/dsm.js --version')} ${chalk.dim('— confirm the installed CLI version')}`);
  console.log();
}
