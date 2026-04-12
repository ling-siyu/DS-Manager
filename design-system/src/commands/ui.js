import { createServer } from 'http';
import { createServer as createNetServer } from 'net';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chokidar from 'chokidar';
import chalk from 'chalk';
import { buildCommand } from './build.js';
import { resolveProjectPaths } from '../utils/paths.js';
import { loadTokens } from '../utils/tokens.js';
import { getComponents } from './list-components.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HTML_PATH = resolve(__dirname, '../ui/index.html');

function loadTokenStyles(paths) {
  const cssVarsPath = resolve(paths.buildDir, 'css-vars.css');
  if (!existsSync(cssVarsPath)) {
    return '';
  }

  return readFileSync(cssVarsPath, 'utf8');
}

async function findAvailablePort(start) {
  for (let port = start; port < start + 10; port += 1) {
    const ok = await new Promise((resolvePort) => {
      const server = createNetServer();
      server.once('error', () => resolvePort(false));
      server.once('listening', () => {
        server.close(() => resolvePort(true));
      });
      server.listen(port, '127.0.0.1');
    });

    if (ok) return port;
  }

  throw new Error(`No port available near ${start}`);
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

function getData(paths) {
  const tokens = loadTokens(paths.tokensPath);
  const components = existsSync(paths.componentsPath)
    ? (getComponents(paths.componentsPath) ?? [])
    : [];

  return { tokens, components };
}

function buildHTML(paths) {
  const template = readFileSync(HTML_PATH, 'utf8');
  const tokenStyles = loadTokenStyles(paths);
  const data = JSON.stringify(getData(paths))
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

export async function uiCommand(options = {}) {
  const paths = resolveProjectPaths();
  const requestedPort = Number.parseInt(options.port ?? '7777', 10);

  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }

  await buildCommand();

  const port = await findAvailablePort(requestedPort);
  const clients = new Set();

  const server = createServer((req, res) => {
    const url = req.url ?? '/';

    try {
      if (url === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(buildHTML(paths));
        return;
      }

      if (url === '/api/data') {
        sendJSON(res, 200, getData(paths));
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

  const watcher = chokidar.watch([paths.tokensPath, paths.componentsPath], {
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
      } else {
        console.log(chalk.yellow(`\n↻  ${name} changed — reloading preview...`));
      }

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
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', () => resolveListen());
  });

  const url = `http://127.0.0.1:${port}`;

  console.log(chalk.cyan('\nDesign system preview is running.\n'));
  console.log(`  ${chalk.bold('URL:')} ${chalk.underline(url)}`);
  if (port !== requestedPort) {
    console.log(chalk.dim(`  Requested port ${requestedPort} was busy, using ${port} instead.`));
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
