import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

import {
  buildManualInstallMessage,
  installPackageIntoProject,
  runStreamingCommand,
  wirePackageScripts,
} from '../src/utils/project-install.js';
import { createBindErrorMessage, findAvailablePort } from '../src/commands/ui.js';
import { getDsmVersion } from '../src/utils/metadata.js';

function createTempProject() {
  const root = mkdtempSync(resolve(tmpdir(), 'dsm-init-test-'));
  mkdirSync(resolve(root, 'design-system'), { recursive: true });
  writeFileSync(resolve(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }, null, 2));
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

test('installPackageIntoProject reports tarball path and manual recovery command on install failure', async () => {
  const targetRoot = createTempProject();

  await assert.rejects(
    installPackageIntoProject(targetRoot, '/tmp/dsm-source', {
      runCommandCapturingStdoutFn: async () => JSON.stringify([{ filename: 'dsm-0.1.0.tgz' }]),
      detectPackageManagerFn: () => ({ name: 'npm', cmd: 'npm', args: ['install', '-D'] }),
      runStreamingCommandFn: async () => {
        throw new Error('spawn npm failed');
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
    }),
    /could not be verified in the project/,
  );
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
