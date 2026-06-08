import { createServer as createNetServer } from 'net';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chokidar from 'chokidar';
import chalk from 'chalk';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { buildCommand } from './build.js';
import { resolveProjectPaths } from '../utils/paths.js';
import { buildPreviewData } from '../utils/preview-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PREVIEW_DIR = resolve(__dirname, '../../preview');

export function createBindErrorMessage(error, { host, port, attemptedPorts } = {}) {
  const reason = error?.message || 'Unknown bind failure';

  if (error?.code === 'EADDRINUSE') {
    const attemptedRange = attemptedPorts?.length
      ? ` after checking ${attemptedPorts[0]}-${attemptedPorts[attemptedPorts.length - 1]}`
      : '';
    return `No port available near ${port}${attemptedRange}; every probed port on ${host} is already in use. Last error: ${reason}`;
  }

  if (error?.code === 'EPERM' || error?.code === 'EACCES') {
    return `Could not bind DSM UI to ${host}:${port} because the environment denied the listen attempt (${error.code}). ${reason}`;
  }

  return `Could not bind DSM UI to ${host}:${port}. ${reason}`;
}

async function probePort(port, host = '127.0.0.1') {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolvePort({ available: false, reason: 'in-use', error });
        return;
      }
      rejectPort(error);
    });
    server.once('listening', () => {
      server.close(() => resolvePort({ available: true }));
    });
    server.listen(port, host);
  });
}

export async function findAvailablePort(start, options = {}) {
  const { host = '127.0.0.1', attempts = 10, probePortFn = probePort } = options;
  const attemptedPorts = [];

  for (let port = start; port < start + attempts; port += 1) {
    attemptedPorts.push(port);
    let result;
    try {
      result = await probePortFn(port, host);
    } catch (error) {
      const bindError = new Error(createBindErrorMessage(error, { host, port }));
      bindError.code = error.code;
      bindError.cause = error;
      throw bindError;
    }
    if (result.available) return port;
  }

  const error = new Error(createBindErrorMessage(
    { code: 'EADDRINUSE', message: 'Address already in use' },
    { host, port: start, attemptedPorts },
  ));
  error.code = 'EADDRINUSE';
  error.attemptedPorts = attemptedPorts;
  throw error;
}

function openBrowser(url) {
  try {
    if (process.platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
      return;
    }
    if (process.platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore', shell: true });
      return;
    }
    execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
  } catch {
    // Non-fatal: the URL is printed to the terminal.
  }
}

/**
 * Vite plugin exposing the resolved preview payload as `virtual:dsm-data`.
 * `getData` is a getter so a watcher can swap in fresh data and trigger reload.
 */
export function dsmDataPlugin(getData) {
  const virtualId = 'virtual:dsm-data';
  const resolvedId = `\0${virtualId}`;
  return {
    name: 'dsm:data',
    resolveId(id) {
      return id === virtualId ? resolvedId : null;
    },
    load(id) {
      return id === resolvedId ? `export default ${JSON.stringify(getData())};` : null;
    },
  };
}

export async function uiCommand(options = {}) {
  const paths = resolveProjectPaths();
  const requestedPort = Number.parseInt(options.port ?? '7777', 10);
  const host = '127.0.0.1';

  console.log(chalk.cyan('\n⚙  Building tokens for preview...\n'));
  await buildCommand();

  let current = buildPreviewData(paths);
  console.log(chalk.dim(
    `  ${current.tokenSets.securamark.length} SecuraMark + ${current.tokenSets.dsm.length} DSM tokens · ${current.components.length} components`,
  ));

  let port;
  try {
    port = await findAvailablePort(requestedPort, { host });
  } catch (error) {
    console.error(chalk.red(`\n✗ ${error.message}\n`));
    process.exit(1);
  }

  const server = await createViteServer({
    configFile: false,
    root: PREVIEW_DIR,
    plugins: [react(), dsmDataPlugin(() => current)],
    server: {
      host,
      port,
      strictPort: true,
      // The preview imports DSM's own components from ../src — outside the
      // preview root — so allow fs access to the whole design-system dir.
      fs: { allow: [paths.dsRoot] },
    },
    clearScreen: false,
    logLevel: 'warn',
  });

  // Live-reload when tokens or components change: rebuild + invalidate the
  // virtual module + full reload (HMR handles preview source files itself).
  const watcher = chokidar.watch([paths.tokensPath, paths.componentsPath], { ignoreInitial: true });
  watcher.on('change', async () => {
    try {
      await buildCommand();
      current = buildPreviewData(paths);
      const mod = server.moduleGraph.getModuleById('\0virtual:dsm-data');
      if (mod) server.moduleGraph.invalidateModule(mod);
      server.ws.send({ type: 'full-reload' });
      console.log(chalk.dim('  ↻ preview data refreshed'));
    } catch (error) {
      console.error(chalk.red(`  preview refresh failed: ${error.message}`));
    }
  });

  await server.listen();
  const url = `http://${host}:${port}/`;
  console.log(chalk.green(`\n✓ DSM preview running at ${chalk.bold(url)}\n`));
  if (options.open !== false) openBrowser(url);
}
