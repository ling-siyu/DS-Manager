import { createServer } from 'http';
import { createServer as createNetServer } from 'net';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chokidar from 'chokidar';
import chalk from 'chalk';
import { buildCommand } from './build.js';
import { collectConfigHealth } from '../utils/config-health.js';
import { resolveProjectPaths } from '../utils/paths.js';
import { loadTokens } from '../utils/tokens.js';
import {
  decorateComponentsWithPreview,
  getPreviewConfigCandidates,
  loadPreviewFrameStyles,
  loadPreviewRuntime,
  renderPreviewFrameHTML,
} from '../utils/preview.js';
import { getComponents } from './list-components.js';
import { scanIconUsage } from '../utils/icons.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UI_DIR = resolve(__dirname, '../ui');
const HTML_PATH = resolve(__dirname, '../ui/index.html');
const UI_REACT_DIR = resolve(__dirname, '../ui-react');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

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

function loadTokenStyles(paths) {
  const cssVarsPath = resolve(paths.buildDir, 'css-vars.css');
  if (!existsSync(cssVarsPath)) {
    return '';
  }

  return readFileSync(cssVarsPath, 'utf8');
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

    if (result.available) {
      return port;
    }
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
    // Non-fatal: the URL is printed to the terminal below.
  }
}

function getData(paths, previewSummary, configHealth) {
  const tokens = loadTokens(paths.tokensPath);
  const components = existsSync(paths.componentsPath)
    ? (getComponents(paths.componentsPath) ?? [])
    : [];

  let iconsData = { aliases: {} };
  if (existsSync(paths.iconsPath)) {
    try {
      iconsData = JSON.parse(readFileSync(paths.iconsPath, 'utf8'));
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not parse icons.json: ${error.message}`));
    }
  }
  const usedIcons = scanIconUsage(paths.repoRoot, iconsData);

  return {
    tokens,
    components: decorateComponentsWithPreview(components, previewSummary, configHealth?.diagnosticsByName),
    preview: previewSummary,
    health: configHealth,
    usedIcons,
  };
}

function buildHTML(paths, previewSummary, configHealth) {
  const template = readFileSync(HTML_PATH, 'utf8');
  const tokenStyles = loadTokenStyles(paths);
  const data = JSON.stringify(getData(paths, previewSummary, configHealth))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return template.replace(
    '</head>',
    `<style>${tokenStyles}</style>\n<script>window.__DSM_DATA__=${data};</script>\n</head>`
  );
}

function sendJSON(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendFile(res, filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(readFileSync(filePath));
}

export async function uiCommand(options = {}) {
  const paths = resolveProjectPaths();
  const requestedPort = Number.parseInt(options.port ?? '7777', 10);

  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }

  await buildCommand();

  let previewRuntime = await loadPreviewRuntime(paths, getComponents(paths.componentsPath) ?? []);
  let configHealth = await collectConfigHealth(paths, { allowRebuildGenerated: false });
  const previewFrameStyles = loadPreviewFrameStyles(paths);

  const host = '127.0.0.1';
  const port = await findAvailablePort(requestedPort, { host });
  const clients = new Set();

  const server = createServer((req, res) => {
    const url = req.url ?? '/';

    try {
      if (url === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(buildHTML(paths, previewRuntime.summary, configHealth));
        return;
      }

      if (url.startsWith('/ui/')) {
        const relativePath = decodeURIComponent(url.slice('/ui/'.length));
        const filePath = resolve(UI_DIR, relativePath);
        if (!filePath.startsWith(UI_DIR) || !existsSync(filePath)) {
          sendJSON(res, 404, { error: 'Not found' });
          return;
        }

        sendFile(res, filePath);
        return;
      }

      if (url.startsWith('/preview-assets/')) {
        const assetPath = url.replace('/preview-assets', '');
        const asset = previewRuntime.assets.get(assetPath);

        if (!asset) {
          sendJSON(res, 404, { error: 'Preview asset not found' });
          return;
        }

        res.writeHead(200, {
          'Content-Type': asset.contentType,
          'Cache-Control': 'no-store',
        });
        res.end(asset.content);
        return;
      }

      if (url.startsWith('/preview/component/')) {
        const componentName = decodeURIComponent(url.slice('/preview/component/'.length));
        const component = (getData(paths, previewRuntime.summary, configHealth).components || [])
          .find((entry) => entry.name === componentName);

        if (!component) {
          sendJSON(res, 404, { error: `Unknown component: ${componentName}` });
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(renderPreviewFrameHTML({
          component,
          previewSummary: previewRuntime.summary,
          tokenStyles: loadTokenStyles(paths),
          frameStyles: previewFrameStyles,
        }));
        return;
      }

      if (url === '/api/data') {
        sendJSON(res, 200, getData(paths, previewRuntime.summary, configHealth));
        return;
      }

      if (url === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write('retry: 3000\n\n');
        clients.add(res);
        req.on('close', () => {
          clients.delete(res);
        });
        return;
      }

      sendJSON(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJSON(res, 500, { error: error.message });
    }
  });

  const watcher = chokidar.watch([
    paths.tokensPath,
    paths.componentsPath,
    ...getPreviewConfigCandidates(paths),
    UI_REACT_DIR,
  ], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  let refreshChain = Promise.resolve();

  watcher.on('change', (filePath) => {
    const name = filePath.split('/').pop();
    refreshChain = refreshChain.then(async () => {
      if (filePath === paths.tokensPath) {
        console.log(chalk.yellow(`\n↻  ${name} changed — rebuilding tokens and reloading preview...`));
        await buildCommand();
      } else if (filePath.startsWith(UI_REACT_DIR)) {
        console.log(chalk.yellow(`\n↻  ${name} changed — rebuilding the React preview bundle...`));
      } else {
        console.log(chalk.yellow(`\n↻  ${name} changed — reloading preview...`));
      }

      previewRuntime = await loadPreviewRuntime(paths, getComponents(paths.componentsPath) ?? []);
      configHealth = await collectConfigHealth(paths, { allowRebuildGenerated: false });

      for (const client of clients) {
        client.write('data: reload\n\n');
      }
    }).catch((error) => {
      console.error(chalk.red('UI refresh error:'), error.message);
    });
  });

  watcher.on('error', (error) => {
    console.error(chalk.red('UI watcher error:'), error.message);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', (error) => {
      rejectListen(new Error(createBindErrorMessage(error, { host, port })));
    });
    server.listen(port, host, () => resolveListen());
  });

  const url = `http://${host}:${port}`;

  console.log(chalk.cyan('\nDesign system preview is running.\n'));
  console.log(`  ${chalk.bold('URL:')} ${chalk.underline(url)}`);
  console.log(`  ${chalk.bold('Preview mode:')} ${previewRuntime.summary.modeLabel || 'Metadata only'}`);
  if (port !== requestedPort) {
    console.log(chalk.dim(`  Requested port ${requestedPort} was busy, using ${port} instead.`));
  }
  if (previewRuntime.summary.configPath) {
    console.log(chalk.dim(`  Adapter: ${previewRuntime.summary.configPath}`));
  }
  if (previewRuntime.summary.errors.length) {
    console.log(chalk.yellow(`  Preview diagnostics: ${previewRuntime.summary.errors[0]}`));
  }
  console.log(chalk.dim('\nWatching tokens and components for changes. Press Ctrl+C to stop.\n'));

  if (options.open !== false) {
    openBrowser(url);
  }

  const shutdown = async () => {
    console.log(chalk.dim('\nShutting down preview server...\n'));
    watcher.close().catch(() => {});
    for (const client of clients) {
      client.end();
    }
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
