import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { spawn } from 'child_process';
import { resolve, relative } from 'path';

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

  return { name: 'npm', cmd: 'npm', args: ['install', '-D'] };
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
  const { cwd, env, onStdout, onStderr } = options;

  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => {
      process.stdout.write(chunk);
      onStdout?.(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk);
      onStderr?.(chunk);
    });

    child.once('error', rejectRun);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      const failure = new Error(signal
        ? `${command} terminated by signal ${signal}`
        : `${command} exited with code ${code}`);
      failure.code = code;
      failure.signal = signal;
      rejectRun(failure);
    });
  });
}

async function runCommandCapturingStdout(command, args, options = {}) {
  const { cwd, env, onStderr } = options;

  return await new Promise((resolveRun, rejectRun) => {
    let stdout = '';
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk);
      onStderr?.(chunk);
    });

    child.once('error', rejectRun);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolveRun(stdout);
        return;
      }

      const failure = new Error(signal
        ? `${command} terminated by signal ${signal}`
        : `${command} exited with code ${code}`);
      failure.code = code;
      failure.signal = signal;
      rejectRun(failure);
    });
  });
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
  } = overrides;
  const packagePath = resolve(targetRoot, 'package.json');
  if (!existsSync(packagePath)) {
    return {
      status: 'skipped (no package.json at project root)',
      installed: false,
    };
  }

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
    error.message = `${error.message}. ${buildManualInstallMessage(targetRoot, tarballPath, packageManager.name)}`;
    throw error;
  }

  if (!verifyInstalledPackageFn(targetRoot)) {
    throw new Error(`Install command completed, but DSM could not be verified in the project. ${buildManualInstallMessage(targetRoot, tarballPath, packageManager.name)}`);
  }

  return {
    status: `installed via ${packageManager.name}`,
    tarballPath,
    packageManager: packageManager.name,
    packageSpec,
    installed: true,
  };
}
