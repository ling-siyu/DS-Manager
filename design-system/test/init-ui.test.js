import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  buildManualInstallMessage,
  cleanupLegacyProjectCache,
  createLocalCliWrapper,
  ensureCoreDsmProjectFiles,
  ensureLocalBinShim,
  getFastUpdatePackageManager,
  installTarballDirectly,
  installPackageIntoProject,
  runStreamingCommand,
  verifyInstalledCli,
  wirePackageScripts,
} from '../src/utils/project-install.js';
import { createBindErrorMessage, findAvailablePort } from '../src/commands/ui.js';
import { getDsmVersion } from '../src/utils/metadata.js';
import { resolveProjectPaths } from '../src/utils/paths.js';
import { collectScanResults } from '../src/commands/scan.js';
import { loadPreviewFrameStyles, loadPreviewSummary, loadPreviewRuntime } from '../src/utils/preview.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '..');

function createTempProject() {
  const root = mkdtempSync(resolve(tmpdir(), 'dsm-init-test-'));
  mkdirSync(resolve(root, 'design-system'), { recursive: true });
  writeFileSync(resolve(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }, null, 2));
  return root;
}

function createPreviewFixtureProject() {
  const root = createTempProject();
  mkdirSync(resolve(root, 'design-system/build'), { recursive: true });
  mkdirSync(resolve(root, 'src/components/ui'), { recursive: true });

  writeFileSync(resolve(root, 'design-system/tokens.json'), JSON.stringify({
    primitive: {
      color: {
        brand: {
          500: { $type: 'color', $value: '#000000' },
        },
      },
    },
  }, null, 2));
  writeFileSync(resolve(root, 'design-system/build/css-vars.css'), ':root{}');
  writeFileSync(resolve(root, 'design-system/build/tailwind.tokens.cjs'), 'module.exports = {};');
  writeFileSync(resolve(root, 'design-system/build/tokens.js'), 'export default {};');
  writeFileSync(resolve(root, 'design-system/components.json'), JSON.stringify({
    components: [
      {
        name: 'Button',
        path: 'src/components/ui/Button.tsx',
        previewProps: { children: 'Hello' },
      },
    ],
  }, null, 2));
  writeFileSync(resolve(root, 'src/components/ui/Button.tsx'), `
    import React from 'react';
    export default function Button({ children }) {
      return <button>{children}</button>;
    }
  `);

  return root;
}

test('runStreamingCommand handles very noisy stdout without ENOBUFS-style buffering failures', async () => {
  const originalWrite = process.stdout.write;
  const chunks = [];

  process.stdout.write = (chunk, encoding, callback) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), encoding));
    if (typeof callback === 'function') callback();
    return true;
  };

  try {
    await runStreamingCommand(
      process.execPath,
      ['-e', "process.stdout.write('x'.repeat(1024 * 1024 + 2048))"],
    );
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.ok(chunks.reduce((sum, size) => sum + size, 0) > 1024 * 1024);
});

test('loadPreviewSummary enables direct source previews without a preview adapter', async () => {
  const root = createPreviewFixtureProject();
  const paths = resolveProjectPaths(root);
  const components = JSON.parse(readFileSync(resolve(root, 'design-system/components.json'), 'utf8')).components;

  const summary = await loadPreviewSummary(paths, components);

  assert.equal(summary.status, 'configured');
  assert.equal(summary.framework, 'react');
  assert.deepEqual(summary.availableComponents, ['Button']);
  assert.equal(typeof summary.autoComponentPaths.Button, 'string');
  assert.match(summary.reason, /auto-render source-backed React components/i);
});

test('loadPreviewRuntime builds a live preview bundle for direct source imports', async () => {
  const root = createPreviewFixtureProject();
  const paths = resolveProjectPaths(root);
  const components = JSON.parse(readFileSync(resolve(root, 'design-system/components.json'), 'utf8')).components;

  const runtime = await loadPreviewRuntime(paths, components);

  assert.equal(runtime.summary.status, 'ready');
  assert.equal(runtime.summary.mode, 'live-render');
  assert.ok(runtime.assets.has('/main.js'));
});

test('installPackageIntoProject reports tarball path and manual recovery command on install failure', async () => {
  const targetRoot = createTempProject();

  await assert.rejects(
    installPackageIntoProject(targetRoot, '/tmp/dsm-source', {
      runCommandCapturingStdoutFn: async () => JSON.stringify([{ filename: 'dsm-0.1.0.tgz' }]),
      detectPackageManagerFn: () => ({ name: 'npm', cmd: 'npm', args: ['install', '-D'] }),
      runStreamingCommandFn: async () => {
        throw new Error('spawn npm failed');
      },
      installTarballDirectlyFn: async () => {
        throw new Error('tar fallback failed');
      },
    }),
    (error) => {
      assert.match(error.message, /spawn npm failed/);
      assert.match(error.message, /design-system\/vendor\/dsm-0\.1\.0\.tgz/);
      assert.match(error.message, /npm install -D \.\/design-system\/vendor\/dsm-0\.1\.0\.tgz/);
      return true;
    },
  );
});

test('installPackageIntoProject verifies the install before reporting success', async () => {
  const targetRoot = createTempProject();

  await assert.rejects(
    installPackageIntoProject(targetRoot, '/tmp/dsm-source', {
      runCommandCapturingStdoutFn: async () => JSON.stringify([{ filename: 'dsm-0.1.0.tgz' }]),
      detectPackageManagerFn: () => ({ name: 'npm', cmd: 'npm', args: ['install', '-D'] }),
      runStreamingCommandFn: async () => {},
      verifyInstalledPackageFn: () => false,
      installTarballDirectlyFn: async () => {},
    }),
    /could not be verified in the project/,
  );
});

test('installPackageIntoProject falls back to a direct tarball extraction when package-manager install fails', async () => {
  const targetRoot = createTempProject();

  const result = await installPackageIntoProject(targetRoot, '/tmp/dsm-source', {
    runCommandCapturingStdoutFn: async () => JSON.stringify([{ filename: 'dsm-0.1.0.tgz' }]),
    detectPackageManagerFn: () => ({ name: 'npm', cmd: 'npm', args: ['install', '-D'] }),
    runStreamingCommandFn: async () => {
      throw new Error('npm stalled');
    },
    verifyInstalledPackageFn: () => true,
    installTarballDirectlyFn: async () => ({
      installedDir: resolve(targetRoot, 'node_modules/dsm'),
      mode: 'direct-tarball',
    }),
  });

  assert.equal(result.installed, true);
  assert.equal(result.status, 'installed via direct tarball fallback');
  assert.equal(result.packageManager, 'direct tarball fallback');
});

test('installPackageIntoProject reports skipped installs without pretending success', async () => {
  const targetRoot = mkdtempSync(resolve(tmpdir(), 'dsm-init-test-no-pkg-'));
  mkdirSync(resolve(targetRoot, 'design-system'), { recursive: true });

  const result = await installPackageIntoProject(targetRoot, '/tmp/dsm-source');

  assert.deepEqual(result, {
    status: 'skipped (no package.json at project root)',
    installed: false,
  });
});

test('findAvailablePort skips EADDRINUSE ports and returns the next free port', async () => {
  const attemptedPorts = [];

  const selectedPort = await findAvailablePort(7777, {
    probePortFn: async (port) => {
      attemptedPorts.push(port);
      if (port === 7777) {
        return { available: false, reason: 'in-use', error: { code: 'EADDRINUSE' } };
      }

      return { available: true };
    },
  });

  assert.equal(selectedPort, 7778);
  assert.deepEqual(attemptedPorts, [7777, 7778]);
});

test('findAvailablePort surfaces permission failures instead of treating them like contention', async () => {
  await assert.rejects(
    findAvailablePort(7777, {
      probePortFn: async () => {
        const error = new Error('listen EPERM: operation not permitted');
        error.code = 'EPERM';
        throw error;
      },
    }),
    (error) => {
      assert.equal(error.code, 'EPERM');
      assert.match(error.message, /operation not permitted/);
      return true;
    },
  );
});

test('createBindErrorMessage distinguishes busy ports from permission denials', () => {
  const busyMessage = createBindErrorMessage(
    { code: 'EADDRINUSE', message: 'Address already in use' },
    { host: '127.0.0.1', port: 7777, attemptedPorts: [7777, 7778, 7779] },
  );
  const deniedMessage = createBindErrorMessage(
    { code: 'EPERM', message: 'operation not permitted' },
    { host: '127.0.0.1', port: 7777 },
  );

  assert.match(busyMessage, /already in use/);
  assert.match(busyMessage, /7777-7779/);
  assert.match(deniedMessage, /environment denied the listen attempt/);
  assert.match(deniedMessage, /EPERM/);
});

test('buildManualInstallMessage includes the exact tarball path and package-manager-specific recovery command', () => {
  const message = buildManualInstallMessage(
    '/tmp/example-app',
    '/tmp/example-app/design-system/vendor/dsm-0.1.0.tgz',
    'pnpm',
  );

  assert.match(message, /\/tmp\/example-app\/design-system\/vendor\/dsm-0\.1\.0\.tgz/);
  assert.match(message, /pnpm add -D \.\/design-system\/vendor\/dsm-0\.1\.0\.tgz/);
});

test('getDsmVersion returns the package version from package.json', () => {
  assert.equal(getDsmVersion(), '0.1.0');
});

test('wirePackageScripts adds dsm:update for scaffolded projects', () => {
  const targetRoot = createTempProject();

  const status = wirePackageScripts(targetRoot, { preferInstalledBinary: false });
  const pkg = JSON.parse(readFileSync(resolve(targetRoot, 'package.json'), 'utf8'));

  assert.equal(status, 'updated');
  assert.equal(pkg.scripts['dsm:update'], 'node design-system/bin/dsm.js update');
});

test('wirePackageScripts keeps dsm:update pinned to the wrapper even when other scripts prefer installed dsm', () => {
  const targetRoot = createTempProject();

  const status = wirePackageScripts(targetRoot, { preferInstalledBinary: true });
  const pkg = JSON.parse(readFileSync(resolve(targetRoot, 'package.json'), 'utf8'));

  assert.equal(status, 'updated');
  assert.equal(pkg.scripts.dsm, 'dsm');
  assert.equal(pkg.scripts['dsm:update'], 'node design-system/bin/dsm.js update');
});

test('ensureCoreDsmProjectFiles bootstraps the minimum DSM config into a fresh repo', () => {
  const targetRoot = mkdtempSync(resolve(tmpdir(), 'dsm-core-scaffold-'));
  writeFileSync(resolve(targetRoot, 'package.json'), JSON.stringify({ name: 'fixture', private: true }, null, 2));

  const results = ensureCoreDsmProjectFiles(targetRoot, PACKAGE_ROOT);

  assert.equal(existsSync(resolve(targetRoot, 'design-system/tokens.json')), true);
  assert.equal(existsSync(resolve(targetRoot, 'design-system/components.json')), true);
  assert.equal(existsSync(resolve(targetRoot, 'design-system/style-dictionary.config.mjs')), true);
  assert.equal(existsSync(resolve(targetRoot, 'design-system/package.json')), true);
  assert.ok(results.some((step) => step.label === 'design-system/tokens.json'));
});

test('createLocalCliWrapper prefers installed DSM and falls back to the source checkout', () => {
  const targetRoot = createTempProject();
  createLocalCliWrapper(targetRoot, '/tmp/source-dsm/src/cli.js');
  const wrapperSource = readFileSync(resolve(targetRoot, 'design-system/bin/dsm.js'), 'utf8');

  assert.match(wrapperSource, /node_modules\/dsm\/bin\/dsm\.js/);
  assert.match(wrapperSource, /\/tmp\/source-dsm\/src\/cli\.js/);
});

test('verifyInstalledCli requires modern commands to succeed across all supported entrypoints', async () => {
  const targetRoot = createTempProject();
  mkdirSync(resolve(targetRoot, 'node_modules/.bin'), { recursive: true });
  mkdirSync(resolve(targetRoot, 'node_modules/dsm/src'), { recursive: true });

  writeFileSync(resolve(targetRoot, 'node_modules/.bin/dsm'), '#!/bin/sh\necho "0.1.0"\n');
  chmodSync(resolve(targetRoot, 'node_modules/.bin/dsm'), 0o755);
  writeFileSync(resolve(targetRoot, 'node_modules/dsm/src/cli.js'), `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('0.1.0');
  process.exit(0);
}
console.error("error: unknown command 'doctor'");
process.exit(1);
`);

  const verification = await verifyInstalledCli(targetRoot, { expectedVersion: '0.1.0' });

  assert.equal(verification.ok, false);
  assert.match(verification.message, /doctor --json/);
});

test('collectScanResults ignores common generated artifact directories', async () => {
  const targetRoot = mkdtempSync(resolve(tmpdir(), 'dsm-scan-ignore-'));
  mkdirSync(resolve(targetRoot, 'storybook-static'), { recursive: true });
  mkdirSync(resolve(targetRoot, 'android/app/build/generated'), { recursive: true });
  mkdirSync(resolve(targetRoot, 'src/components'), { recursive: true });

  writeFileSync(resolve(targetRoot, 'storybook-static/app.js'), 'const color = "#ff0000";\n');
  writeFileSync(resolve(targetRoot, 'android/app/build/generated/index.js'), 'const color = "#00ff00";\n');
  writeFileSync(resolve(targetRoot, 'src/components/Button.tsx'), 'export function Button() { return <div style={{ color: "#0000ff" }} />; }\n');

  const originalCwd = process.cwd();
  process.chdir(targetRoot);

  try {
    const results = await collectScanResults('.');
    assert.equal(results.results.length, 1);
    assert.equal(results.results[0].file, 'src/components/Button.tsx');
  } finally {
    process.chdir(originalCwd);
  }
});

test('loadPreviewFrameStyles uses packaged UI assets rather than project-local ui-react files', () => {
  const styles = loadPreviewFrameStyles({
    dsRoot: '/tmp/nonexistent-design-system',
  });

  assert.ok(styles.length > 0);
});

test('cleanupLegacyProjectCache removes repo-local npm cache directories', () => {
  const targetRoot = createTempProject();
  mkdirSync(resolve(targetRoot, 'design-system/.npm-cache/_logs'), { recursive: true });
  writeFileSync(resolve(targetRoot, 'design-system/.npm-cache/_logs/debug.log'), 'hello');

  cleanupLegacyProjectCache(targetRoot);

  assert.equal(existsSync(resolve(targetRoot, 'design-system/.npm-cache')), false);
});

test('ensureLocalBinShim creates a consumer-facing dsm entrypoint that can resolve both installed and project-local DSM runtimes', () => {
  const targetRoot = createTempProject();

  ensureLocalBinShim(targetRoot);

  const shimSource = readFileSync(resolve(targetRoot, 'node_modules/.bin/dsm'), 'utf8');
  assert.match(shimSource, /path\.resolve\(shimDir, '\.\.\/dsm\/bin\/dsm\.js'\)/);
  assert.match(shimSource, /path\.resolve\(shimDir, '\.\.\/dsm\/src\/cli\.js'\)/);
  assert.match(shimSource, /path\.resolve\(shimDir, '\.\.\/src\/cli\.js'\)/);
  assert.match(shimSource, /path\.resolve\(shimDir, '\.\.\/\.\.\/design-system\/bin\/dsm\.js'\)/);
  assert.match(shimSource, /path\.resolve\(shimDir, '\.\.\/\.\.\/\.\.\/design-system\/bin\/dsm\.js'\)/);
});

test('installTarballDirectly extracts the npm package payload into node_modules/dsm and refreshes the local shim', async () => {
  const targetRoot = createTempProject();
  const tarballPath = resolve(targetRoot, 'design-system/vendor/dsm-0.1.0.tgz');
  mkdirSync(resolve(targetRoot, 'design-system/vendor'), { recursive: true });
  writeFileSync(tarballPath, 'fake tgz payload');

  let extractedTo = null;
  await installTarballDirectly(targetRoot, tarballPath, {
    runStreamingCommandFn: async (_command, args) => {
      extractedTo = args[3];
      const packageDir = resolve(args[3], 'package');
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(resolve(packageDir, 'package.json'), JSON.stringify({ name: 'dsm' }));
    },
  });

  assert.equal(existsSync(resolve(targetRoot, 'node_modules/dsm/package.json')), true);
  assert.equal(existsSync(resolve(targetRoot, 'node_modules/.bin/dsm')), true);
  assert.equal(existsSync(resolve(extractedTo, 'package')), false);
});

test('the generated shim still works when executed from node_modules/dsm/bin/dsm.js', async () => {
  const targetRoot = createTempProject();
  mkdirSync(resolve(targetRoot, 'node_modules/dsm/bin'), { recursive: true });
  mkdirSync(resolve(targetRoot, 'node_modules/dsm/src'), { recursive: true });
  writeFileSync(resolve(targetRoot, 'node_modules/dsm/package.json'), JSON.stringify({ name: 'dsm', type: 'module' }));

  ensureLocalBinShim(targetRoot);
  const shimSource = readFileSync(resolve(targetRoot, 'node_modules/.bin/dsm'), 'utf8');
  writeFileSync(resolve(targetRoot, 'node_modules/dsm/bin/dsm.js'), shimSource, 'utf8');
  chmodSync(resolve(targetRoot, 'node_modules/dsm/bin/dsm.js'), 0o755);
  writeFileSync(resolve(targetRoot, 'node_modules/dsm/src/cli.js'), `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('0.1.0');
  process.exit(0);
}
console.error('unexpected args');
process.exit(1);
`);

  const output = await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [
      resolve(targetRoot, 'node_modules/dsm/bin/dsm.js'),
      '--version',
    ], {
      cwd: targetRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.once('error', rejectRun);
    child.once('close', (code) => {
      if (code !== 0) {
        rejectRun(new Error(stderr || `exit ${code}`));
        return;
      }
      resolveRun(stdout.trim());
    });
  });

  assert.equal(output, '0.1.0');
});

test('the generated shim still works when executed from node_modules/.bin/dsm in a plain CommonJS context', async () => {
  const targetRoot = createTempProject();
  mkdirSync(resolve(targetRoot, 'node_modules/dsm/src'), { recursive: true });

  ensureLocalBinShim(targetRoot);
  writeFileSync(resolve(targetRoot, 'node_modules/dsm/src/cli.js'), `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('0.1.0');
  process.exit(0);
}
console.error('unexpected args');
process.exit(1);
`);

  const output = await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [
      resolve(targetRoot, 'node_modules/.bin/dsm'),
      '--version',
    ], {
      cwd: targetRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.once('error', rejectRun);
    child.once('close', (code) => {
      if (code !== 0) {
        rejectRun(new Error(stderr || `exit ${code}`));
        return;
      }
      resolveRun(stdout.trim());
    });
  });

  assert.equal(output, '0.1.0');
});

test('getFastUpdatePackageManager uses a lighter no-save npm install path for updates', () => {
  const targetRoot = createTempProject();

  const packageManager = getFastUpdatePackageManager(targetRoot);

  assert.equal(packageManager.name, 'npm');
  assert.deepEqual(packageManager.args, [
    'install',
    '--no-save',
    '--prefer-offline',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    '--no-package-lock',
  ]);
});
