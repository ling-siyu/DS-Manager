import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { resolve, relative } from 'path';

export function cleanupLegacyProjectCache(targetRoot) {
  rmSync(resolve(targetRoot, 'design-system/.npm-cache'), { recursive: true, force: true });
}

export function wireMcpServer(targetRoot, command, args) {
  const settingsDir = resolve(targetRoot, '.claude');
  const settingsPath = resolve(settingsDir, 'settings.json');

  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });

  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      settings = {};
    }
  }

  settings.mcpServers ??= {};
  settings.mcpServers.dsm = { command, args, cwd: targetRoot };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return 'updated';
}

export function createLocalCliWrapper(targetRoot, cliPath) {
  const binDir = resolve(targetRoot, 'design-system/bin');
  const wrapperPath = resolve(binDir, 'dsm.js');

  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

  const packageCliPath = './../../node_modules/dsm/bin/dsm.js';
  const sourceCliPath = cliPath;
  const wrapperSource = `#!/usr/bin/env node
import { spawn } from 'child_process';

const candidates = [
  ${JSON.stringify(packageCliPath)},
  ${JSON.stringify(sourceCliPath)},
];

async function runCandidate(candidate) {
  return await new Promise((resolveRun) => {
    const child = spawn(process.execPath, [candidate, ...process.argv.slice(2)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.once('error', (error) => {
      resolveRun({
        ok: false,
        candidate,
        code: 1,
        stdout,
        stderr: error.stack || String(error),
      });
    });

    child.once('close', (code) => {
      resolveRun({
        ok: code === 0,
        candidate,
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

let lastResult = null;
for (const candidate of candidates) {
  const result = await runCandidate(candidate);
  if (result.ok) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(0);
  }

  lastResult = result;
}

if (lastResult?.stdout) process.stdout.write(lastResult.stdout);
if (lastResult?.stderr) process.stderr.write(lastResult.stderr);
if (!lastResult) process.stderr.write('Could not locate a working DSM CLI.\\n');
process.exit(lastResult?.code ?? 1);
`;

  writeFileSync(wrapperPath, wrapperSource, 'utf8');
  chmodSync(wrapperPath, 0o755);
}

export function ensureLocalBinShim(targetRoot) {
  const binDir = resolve(targetRoot, 'node_modules/.bin');
  const binPath = resolve(binDir, 'dsm');

  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

  const shimSource = `#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const candidates = [
  fileURLToPath(new URL('../dsm/bin/dsm.js', import.meta.url)),
  fileURLToPath(new URL('../src/cli.js', import.meta.url)),
  fileURLToPath(new URL('../../design-system/bin/dsm.js', import.meta.url)),
  fileURLToPath(new URL('../../../design-system/bin/dsm.js', import.meta.url)),
].filter((candidate, index, all) => all.indexOf(candidate) === index);

let lastFailure = null;
for (const candidate of candidates) {
  if (!existsSync(candidate)) continue;

  const exitCode = await new Promise((resolveRun) => {
    const child = spawn(process.execPath, [candidate, ...process.argv.slice(2)], {
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      lastFailure = error.stack || String(error);
      resolveRun(1);
    });

    child.once('close', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      resolveRun(code ?? 1);
    });
  });

  if (exitCode === 0) {
    process.exit(0);
  }

  lastFailure = lastFailure || \`\${candidate} exited with code \${exitCode}\`;
}

if (lastFailure) {
  process.stderr.write(String(lastFailure) + '\\n');
}
process.exit(1);
`;

  writeFileSync(binPath, shimSource, 'utf8');
  chmodSync(binPath, 0o755);
}

export function wirePackageScripts(targetRoot, options = {}) {
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
    // Keep update pinned to the project-local wrapper so pilot projects
    // continue pulling from the developer checkout rather than node_modules.
    'dsm:update': 'node design-system/bin/dsm.js update',
  };

  let changed = false;
  for (const [name, command] of Object.entries(desiredScripts)) {
    const current = pkg.scripts[name];
    const legacyCommand = name === 'dsm'
      ? legacyCliPrefix
      : `${legacyCliPrefix}${command.slice(cliPrefix.length)}`;

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

export function detectPackageManager(targetRoot) {
  if (existsSync(resolve(targetRoot, 'pnpm-lock.yaml'))) {
    return { name: 'pnpm', cmd: 'pnpm', args: ['add', '-D'] };
  }

  if (existsSync(resolve(targetRoot, 'yarn.lock'))) {
    return { name: 'yarn', cmd: 'yarn', args: ['add', '-D'] };
  }

  if (existsSync(resolve(targetRoot, 'bun.lock')) || existsSync(resolve(targetRoot, 'bun.lockb'))) {
    return { name: 'bun', cmd: 'bun', args: ['add', '-d'] };
  }

  return { name: 'npm', cmd: 'npm', args: ['install', '-D', '--no-audit', '--no-fund', '--ignore-scripts', '--no-package-lock'] };
}

export function getFastUpdatePackageManager(targetRoot) {
  const packageManager = detectPackageManager(targetRoot);

  if (packageManager.name === 'npm') {
    return {
      ...packageManager,
      args: ['install', '--no-save', '--prefer-offline', '--no-audit', '--no-fund', '--ignore-scripts', '--no-package-lock'],
    };
  }

  return packageManager;
}

export async function installTarballDirectly(targetRoot, tarballPath, overrides = {}) {
  const { runStreamingCommandFn = runStreamingCommand } = overrides;
  const nodeModulesDir = resolve(targetRoot, 'node_modules');
  if (!existsSync(nodeModulesDir)) mkdirSync(nodeModulesDir, { recursive: true });
  const unpackDir = mkdtempSync(resolve(nodeModulesDir, '.dsm-unpack-'));
  const packageDir = resolve(unpackDir, 'package');
  const installedDir = resolve(nodeModulesDir, 'dsm');

  try {
    await runStreamingCommandFn('tar', ['-xzf', tarballPath, '-C', unpackDir], {
      cwd: targetRoot,
      env: process.env,
      timeoutMs: 30_000,
    });

    if (!existsSync(packageDir)) {
      throw new Error(`Tarball did not contain an npm package payload at ${packageDir}`);
    }

    rmSync(installedDir, { recursive: true, force: true });
    renameSync(packageDir, installedDir);
    ensureLocalBinShim(targetRoot);

    return {
      installedDir,
      mode: 'direct-tarball',
    };
  } finally {
    rmSync(unpackDir, { recursive: true, force: true });
  }
}

export function verifyInstalledPackage(targetRoot) {
  const packagePath = resolve(targetRoot, 'package.json');
  let pkg = null;

  if (existsSync(packagePath)) {
    try {
      pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    } catch {
      pkg = null;
    }
  }

  const installedPackagePath = resolve(targetRoot, 'node_modules/dsm/package.json');
  const listedInManifest = Boolean(
    pkg?.devDependencies?.dsm
      || pkg?.dependencies?.dsm
      || pkg?.optionalDependencies?.dsm
  );

  return existsSync(installedPackagePath) || listedInManifest;
}

export async function runStreamingCommand(command, args, options = {}) {
  const { cwd, env, onStdout, onStderr, timeoutMs } = options;

  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    let timeoutId = null;

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      rejectRun(error);
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolveRun();
    };

    if (timeoutMs) {
      timeoutId = setTimeout(() => {
        const failure = new Error(`${command} timed out after ${timeoutMs}ms`);
        failure.code = 'ETIMEDOUT';
        child.kill('SIGTERM');
        rejectOnce(failure);
      }, timeoutMs);
    }

    child.stdout?.on('data', (chunk) => {
      process.stdout.write(chunk);
      onStdout?.(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk);
      onStderr?.(chunk);
    });

    child.once('error', rejectOnce);
    child.once('close', (code, signal) => {
      if (settled) return;
      if (code === 0) {
        resolveOnce();
        return;
      }

      const failure = new Error(signal
        ? `${command} terminated by signal ${signal}`
        : `${command} exited with code ${code}`);
      failure.code = code;
      failure.signal = signal;
      rejectOnce(failure);
    });
  });
}

export async function runCommandCapturingStdout(command, args, options = {}) {
  const { cwd, env, onStderr, timeoutMs } = options;

  return await new Promise((resolveRun, rejectRun) => {
    let stdout = '';
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    let timeoutId = null;

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      rejectRun(error);
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolveRun(stdout);
    };

    if (timeoutMs) {
      timeoutId = setTimeout(() => {
        const failure = new Error(`${command} timed out after ${timeoutMs}ms`);
        failure.code = 'ETIMEDOUT';
        child.kill('SIGTERM');
        rejectOnce(failure);
      }, timeoutMs);
    }

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk);
      onStderr?.(chunk);
    });

    child.once('error', rejectOnce);
    child.once('close', (code, signal) => {
      if (settled) return;
      if (code === 0) {
        resolveOnce();
        return;
      }

      const failure = new Error(signal
        ? `${command} terminated by signal ${signal}`
        : `${command} exited with code ${code}`);
      failure.code = code;
      failure.signal = signal;
      rejectOnce(failure);
    });
  });
}

export async function verifyInstalledCli(targetRoot, options = {}) {
  const { expectedVersion } = options;
  const candidates = [
    {
      label: 'npx dsm',
      checks: [
        { label: '--version', command: 'npx', args: ['--no-install', 'dsm', '--version'], expectOutput: true },
        { label: 'doctor --json', command: 'npx', args: ['--no-install', 'dsm', 'doctor', '--json'], expectJson: true },
      ],
    },
    {
      label: './node_modules/.bin/dsm',
      checks: [
        { label: '--version', command: './node_modules/.bin/dsm', args: ['--version'], expectOutput: true },
        { label: 'doctor --json', command: './node_modules/.bin/dsm', args: ['doctor', '--json'], expectJson: true },
      ],
    },
    {
      label: 'node ./node_modules/dsm/src/cli.js',
      checks: [
        { label: '--version', command: process.execPath, args: ['./node_modules/dsm/src/cli.js', '--version'], expectOutput: true },
        { label: 'doctor --json', command: process.execPath, args: ['./node_modules/dsm/src/cli.js', 'doctor', '--json'], expectJson: true },
      ],
    },
  ];
  const results = [];

  for (const candidate of candidates) {
    const candidateResult = {
      label: candidate.label,
      ok: true,
      checks: [],
    };

    for (const check of candidate.checks) {
      try {
        const stdout = await runCommandCapturingStdout(check.command, check.args, {
          cwd: targetRoot,
          env: process.env,
          timeoutMs: 15_000,
        });
        const output = stdout.trim();

        if (check.expectOutput && !output) {
          candidateResult.ok = false;
          candidateResult.checks.push({ label: check.label, ok: false, message: 'produced no output' });
          continue;
        }

        if (check.expectOutput && expectedVersion && output !== expectedVersion) {
          candidateResult.ok = false;
          candidateResult.checks.push({ label: check.label, ok: false, message: `returned ${output}, expected ${expectedVersion}` });
          continue;
        }

        if (check.expectJson) {
          try {
            JSON.parse(output);
          } catch {
            candidateResult.ok = false;
            candidateResult.checks.push({ label: check.label, ok: false, message: 'did not produce valid JSON output' });
            continue;
          }
        }

        candidateResult.checks.push({ label: check.label, ok: true, output });
      } catch (error) {
        candidateResult.ok = false;
        candidateResult.checks.push({ label: check.label, ok: false, message: error.message });
      }
    }

    results.push(candidateResult);
  }

  const failed = results.filter((entry) => entry.ok !== true);
  if (failed.length === 0) {
    return {
      ok: true,
      command: results.map((entry) => {
        const versionCheck = entry.checks.find((check) => check.label === '--version');
        return `${entry.label} -> ${versionCheck?.output || 'ok'}`;
      }).join(' | '),
      output: results[0]?.checks?.find((check) => check.label === '--version')?.output || '',
      results,
    };
  }

  return {
    ok: false,
    message: failed.map((entry) => entry.checks
      .filter((check) => check.ok !== true)
      .map((check) => `${entry.label} ${check.label} ${check.message}`)
      .join(' | '))
      .filter(Boolean)
      .join(' | '),
    results,
  };
}

export function buildManualInstallMessage(targetRoot, tarballPath, packageManagerName) {
  const relativeTarballPath = `./${relative(targetRoot, tarballPath)}`;
  const commandByPackageManager = {
    npm: `npm install -D ${relativeTarballPath}`,
    pnpm: `pnpm add -D ${relativeTarballPath}`,
    yarn: `yarn add -D ${relativeTarballPath}`,
    bun: `bun add -d ${relativeTarballPath}`,
  };

  return `Tarball available at ${tarballPath}. Manual recovery: (cd ${targetRoot} && ${commandByPackageManager[packageManagerName] ?? commandByPackageManager.npm})`;
}

export async function installPackageIntoProject(targetRoot, packageSourceRoot, overrides = {}) {
  const {
    runCommandCapturingStdoutFn = runCommandCapturingStdout,
    runStreamingCommandFn = runStreamingCommand,
    verifyInstalledPackageFn = verifyInstalledPackage,
    detectPackageManagerFn = detectPackageManager,
    installTarballDirectlyFn = installTarballDirectly,
  } = overrides;
  const packagePath = resolve(targetRoot, 'package.json');
  if (!existsSync(packagePath)) {
    return {
      status: 'skipped (no package.json at project root)',
      installed: false,
    };
  }

  cleanupLegacyProjectCache(targetRoot);
  ensureLocalBinShim(targetRoot);
  const vendorDir = resolve(targetRoot, 'design-system/vendor');
  const npmCacheDir = mkdtempSync(resolve(tmpdir(), 'dsm-npm-cache-'));
  if (!existsSync(vendorDir)) mkdirSync(vendorDir, { recursive: true });

  const npmEnv = { ...process.env, npm_config_cache: npmCacheDir };

  for (const file of readdirSync(vendorDir)) {
    if (file.startsWith('dsm-') && file.endsWith('.tgz')) {
      unlinkSync(resolve(vendorDir, file));
    }
  }

  try {
    const packOutput = await runCommandCapturingStdoutFn(
      'npm',
      ['pack', '--json', '--pack-destination', vendorDir],
      { cwd: packageSourceRoot, env: npmEnv },
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

    const packageManager = detectPackageManagerFn(targetRoot);
    const packageSpec = `./design-system/vendor/${packedFilename}`;
    const tarballPath = resolve(vendorDir, packedFilename);
    let installMode = packageManager.name;

    try {
      await runStreamingCommandFn(
        packageManager.cmd,
        [...packageManager.args, packageSpec],
        {
          cwd: targetRoot,
          env: packageManager.name === 'npm' ? npmEnv : process.env,
        },
      );
    } catch (error) {
      try {
        await installTarballDirectlyFn(targetRoot, tarballPath, {
          runStreamingCommandFn,
        });
        installMode = 'direct tarball fallback';
      } catch (fallbackError) {
        error.message = `${error.message}. ${buildManualInstallMessage(targetRoot, tarballPath, packageManager.name)} Direct tarball fallback also failed: ${fallbackError.message}`;
        throw error;
      }
    }

    if (!verifyInstalledPackageFn(targetRoot)) {
      await installTarballDirectlyFn(targetRoot, tarballPath, {
        runStreamingCommandFn,
      });

      if (!verifyInstalledPackageFn(targetRoot)) {
        throw new Error(`Install command completed, but DSM could not be verified in the project. ${buildManualInstallMessage(targetRoot, tarballPath, packageManager.name)}`);
      }

      installMode = 'direct tarball fallback';
    }

    return {
      status: `installed via ${installMode}`,
      tarballPath,
      packageManager: installMode,
      packageSpec,
      installed: true,
    };
  } finally {
    rmSync(npmCacheDir, { recursive: true, force: true });
    cleanupLegacyProjectCache(targetRoot);
  }
}
