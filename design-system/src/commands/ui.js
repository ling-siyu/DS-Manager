import { createServer as createNetServer } from 'net';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chokidar from 'chokidar';
import chalk from 'chalk';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { runBuild } from './build.js';
import { resolveProjectPaths } from '../utils/paths.js';
import { buildPreviewData } from '../utils/preview-data.js';
import { buildSecuramarkCss } from '../utils/securamark-css.js';

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

/**
 * Throwing core: build tokens, assemble preview data, and start the Vite preview
 * server. No console UI beyond optional onLog, no process.exit, no browser —
 * safe for the edit loop (screenshots) and the MCP server.
 *
 * Options:
 *  - port        starting port to probe (default 7777)
 *  - securamark  include SecuraMark data + CSS compile (default true). false
 *                skips the cross-repo Tailwind compile entirely — much faster
 *                startup when only DSM components are being staged.
 *  - watch       enable the tokens/components live-reload watcher (default false)
 *  - build       run the token build before assembling data (default true)
 *  - onLog       optional (msg) => void progress sink
 *
 * Returns { server, port, url, data, close() } — close() shuts down both the
 * Vite server and the watcher (when enabled).
 */
export async function createPreviewServer(paths = resolveProjectPaths(), options = {}) {
  const {
    port: requestedPort = 7777,
    securamark = true,
    watch = false,
    build = true,
    onLog = () => {},
  } = options;
  const host = '127.0.0.1';

  if (build) await runBuild(paths);

  const compileSecuramarkCss = async (data) => {
    if (!securamark || !data.securamark.dir) return;
    try {
      data.securamark.css = await buildSecuramarkCss({
        securamarkDir: data.securamark.dir,
        tokensPath: resolve(paths.repoRoot, 'targets/securamark/tokens.json'),
      });
    } catch (error) {
      onLog(`SecuraMark CSS compile skipped: ${error.message}`);
    }
  };

  let current = buildPreviewData(paths);
  if (!securamark) current.securamark = { dir: null, components: [], css: '' };
  await compileSecuramarkCss(current);

  const port = await findAvailablePort(Number.parseInt(requestedPort, 10), { host });

  const server = await createViteServer({
    configFile: false,
    root: PREVIEW_DIR,
    plugins: [react(), dsmDataPlugin(() => current)],
    // Single React copy even when rendering SecuraMark's cross-repo components.
    resolve: { dedupe: ['react', 'react-dom'] },
    server: {
      host,
      port,
      strictPort: true,
      // Allow fs access to the design-system dir (DSM's own components, outside
      // the preview root) and the read-only SecuraMark source (loaded via /@fs).
      fs: { allow: [paths.dsRoot, current.securamark.dir].filter(Boolean) },
    },
    clearScreen: false,
    logLevel: 'warn',
  });

  // Live-reload when tokens or components change: rebuild + invalidate the
  // virtual module + full reload (HMR handles preview source files itself).
  let watcher = null;
  if (watch) {
    watcher = chokidar.watch([paths.tokensPath, paths.componentsPath], { ignoreInitial: true });
    watcher.on('change', async () => {
      try {
        await runBuild(paths);
        current = buildPreviewData(paths);
        if (!securamark) current.securamark = { dir: null, components: [], css: '' };
        await compileSecuramarkCss(current);
        const mod = server.moduleGraph.getModuleById('\0virtual:dsm-data');
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
        onLog('preview data refreshed');
      } catch (error) {
        onLog(`preview refresh failed: ${error.message}`);
      }
    });
  }

  await server.listen();
  const url = `http://${host}:${port}/`;

  return {
    server,
    port,
    url,
    data: current,
    async close() {
      if (watcher) await watcher.close();
      await server.close();
    },
  };
}

export async function uiCommand(options = {}) {
  console.log(chalk.cyan('\n⚙  Building tokens for preview...\n'));

  let preview;
  try {
    preview = await createPreviewServer(resolveProjectPaths(), {
      port: options.port ?? '7777',
      watch: true,
      onLog: (msg) => console.log(chalk.dim(`  ${msg}`)),
    });
  } catch (error) {
    console.error(chalk.red(`\n✗ ${error.message}\n`));
    process.exit(1);
  }

  const { data, url } = preview;
  console.log(chalk.dim(
    `  ${data.tokenSets.securamark.length} SecuraMark + ${data.tokenSets.dsm.length} DSM tokens · ` +
    `${data.components.length} DSM + ${data.securamark.components.length} SecuraMark components`,
  ));
  console.log(chalk.green(`\n✓ DSM preview running at ${chalk.bold(url)}\n`));
  if (options.open !== false) openBrowser(url);
}
