import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import {
  buildManualInstallMessage,
  cleanupLegacyProjectCache,
  getFastUpdatePackageManager,
  runCommandCapturingStdout,
  runStreamingCommand,
  verifyInstalledCli,
  verifyInstalledPackage,
} from './project-install.js';

function cleanupTempDir(tempDir) {
  if (!tempDir) return;
  rmSync(tempDir, { recursive: true, force: true });
}

export async function refreshInstalledDsm(targetRoot, packageSourceRoot, options = {}) {
  const logger = options.logger ?? (() => {});
  const timeoutMs = options.installTimeoutMs ?? 120_000;
  const expectedVersion = options.expectedVersion;
  const vendorDir = resolve(targetRoot, 'design-system/vendor');
  const npmCacheDir = mkdtempSync(resolve(tmpdir(), 'dsm-npm-cache-'));
  const npmEnv = { ...process.env, npm_config_cache: npmCacheDir };
  const steps = [];

  if (!existsSync(vendorDir)) mkdirSync(vendorDir, { recursive: true });
  cleanupLegacyProjectCache(targetRoot);

  try {
    logger('pack tarball', 'in_progress');
    const packOutput = await runCommandCapturingStdout(
      'npm',
      ['pack', '--json', '--pack-destination', vendorDir],
      { cwd: packageSourceRoot, env: npmEnv, timeoutMs: 30_000 },
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

    const tarballPath = resolve(vendorDir, packedFilename);
    steps.push({ name: 'pack tarball', status: 'done', tarballPath });
    logger('pack tarball', 'done', tarballPath);

    const packageManager = getFastUpdatePackageManager(targetRoot);
    const packageSpec = `./design-system/vendor/${packedFilename}`;

    logger('install tarball', 'in_progress');
    try {
      await runStreamingCommand(
        packageManager.cmd,
        [...packageManager.args, packageSpec],
        {
          cwd: targetRoot,
          env: packageManager.name === 'npm' ? npmEnv : process.env,
          timeoutMs,
        },
      );
    } catch (error) {
      const timeoutHint = error.code === 'ETIMEDOUT'
        ? 'The install step timed out. Retry `dsm update`, or run the manual recovery command below.'
        : 'DSM could not install the tarball automatically.';
      error.message = `${error.message}. ${timeoutHint} ${buildManualInstallMessage(targetRoot, tarballPath, packageManager.name)}`;
      throw error;
    }

    if (!verifyInstalledPackage(targetRoot)) {
      throw new Error(`Install command completed, but DSM could not be verified in the project. ${buildManualInstallMessage(targetRoot, tarballPath, packageManager.name)}`);
    }

    steps.push({ name: 'install tarball', status: 'done', packageManager: packageManager.name, tarballPath, packageSpec });
    logger('install tarball', 'done', packageManager.name);

    logger('verify installed package', 'in_progress');
    const cliVerification = await verifyInstalledCli(targetRoot, { expectedVersion });
    if (!cliVerification.ok) {
      throw new Error(`${cliVerification.message}. Keeping the project-local wrapper enabled for recovery.`);
    }

    steps.push({ name: 'verify installed package', status: 'done', verification: cliVerification });
    logger('verify installed package', 'done', cliVerification.command);

    return {
      ok: true,
      steps,
      tarballPath,
      packageManager: packageManager.name,
      packageSpec,
      verification: cliVerification,
    };
  } finally {
    cleanupTempDir(npmCacheDir);
    cleanupLegacyProjectCache(targetRoot);
  }
}
