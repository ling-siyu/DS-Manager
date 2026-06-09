import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { loadTokens, loadRawTokens, flattenTokens, resolveReference } from './tokens.js';
import { discoverComponents, ownProps } from './component-discovery.js';
import { captureIconUsage } from './icons.js';

// Pure data layer for the preview. buildPreviewData() turns the on-disk token
// and component sources into a single JSON-serializable object the Vite app
// consumes via the `virtual:dsm-data` module. No Vite/React/DOM here — this is
// fully testable headless.

const SM_EXT = 'com.securamark';
const COMPONENT_FILE = /\.(tsx|jsx|ts|js)$/;

/** Title-case a dotted token path's leading segment(s) into a gallery group. */
function groupLabel(path) {
  const segs = path.split('.');
  const head = ['primitive', 'semantic', 'component'].includes(segs[0])
    ? segs.slice(0, 2)
    : segs.slice(0, 1);
  return head
    .map((seg) => seg
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(' / ');
}

/** Normalize one flattened token (DSM-resolved or raw DTCG) to a gallery item. */
function toGalleryItem(path, token) {
  const ext = token.$extensions?.[SM_EXT] ?? {};
  return {
    path,
    name: path.split('.').slice(-1)[0],
    group: groupLabel(path),
    type: token.$type ?? 'unknown',
    value: token.resolvedValue ?? token.$value,
    ...(token.cssVar ? { cssVar: token.cssVar } : {}),
    ...(ext.themeLight ? { themeLight: ext.themeLight } : {}),
    ...(ext.lineHeight ? { lineHeight: ext.lineHeight } : {}),
    ...(token.$description ? { description: token.$description } : {}),
  };
}

/** DSM's own design system — uses loadTokens so references resolve + cssVar is set. */
function buildDsmTokens(tokensPath) {
  if (!tokensPath || !existsSync(tokensPath)) return [];
  try {
    const resolved = loadTokens(tokensPath);
    return Object.entries(resolved).map(([path, token]) => toGalleryItem(path, token));
  } catch (err) {
    // A malformed token file shouldn't take down the whole preview.
    console.warn(`preview-data: could not load DSM tokens (${err.message})`);
    return [];
  }
}

/** Resolve `{alias}` reference strings inside a composite token value object so
 *  typography/transition specimens render real values, not raw references. */
function resolveComposite(value, flat) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = typeof v === 'string' && v.startsWith('{') ? resolveReference(v, flat) : v;
  }
  return out;
}

/** SecuraMark's captured DTCG — raw groups (color/fontFamily/fontSize/…). */
function buildSecuramarkTokens(securamarkTokensPath) {
  if (!securamarkTokensPath || !existsSync(securamarkTokensPath)) return [];
  try {
    const raw = loadRawTokens(securamarkTokensPath);
    const flat = flattenTokens(raw);
    return Object.entries(flat).map(([path, token]) =>
      toGalleryItem(path, { ...token, $value: resolveComposite(token.$value, flat) }),
    );
  } catch (err) {
    console.warn(`preview-data: could not load SecuraMark tokens (${err.message})`);
    return [];
  }
}

/**
 * Component matrix data: the curated registry (which carries previewProps /
 * previewScenarios / description) enriched with live discovery (authored props
 * via ownProps). Entries whose path is not a component source file (e.g. junk
 * rows pointing at index.html) are excluded.
 */
function buildComponents({ componentsPath, dsRoot }) {
  const registry = componentsPath && existsSync(componentsPath)
    ? JSON.parse(readFileSync(componentsPath, 'utf8'))
    : { components: [] };
  const entries = (registry.components ?? []).filter((c) => COMPONENT_FILE.test(c.path ?? ''));

  let byName = new Map();
  try { byName = discoverComponents(dsRoot).byName; } catch { byName = new Map(); }

  return entries.map((c) => {
    const discovered = byName.get(c.name);
    const props = discovered ? ownProps(discovered.props) : (c.props ?? {});
    return {
      name: c.name,
      path: c.path,
      description: c.description ?? '',
      status: c.status ?? 'stable',
      variants: discovered?.variants?.length ? discovered.variants : (c.variants ?? []),
      sizes: discovered?.sizes?.length ? discovered.sizes : (c.sizes ?? []),
      props,
      previewProps: c.previewProps ?? {},
      previewScenarios: Array.isArray(c.previewScenarios) ? c.previewScenarios : [],
    };
  });
}

function readCssVars(buildDir) {
  const cssPath = buildDir ? resolve(buildDir, 'css-vars.css') : null;
  if (!cssPath || !existsSync(cssPath)) return '';
  return readFileSync(cssPath, 'utf8');
}

/** Icon usage: SecuraMark from its committed capture; DSM scanned live. */
function buildIcons({ repoRoot, dsRoot }) {
  const capturePath = repoRoot ? resolve(repoRoot, 'targets/securamark/icons.json') : null;
  let securamark = null;
  if (capturePath && existsSync(capturePath)) {
    try { securamark = JSON.parse(readFileSync(capturePath, 'utf8')); } catch { securamark = null; }
  }

  let dsm = null;
  if (dsRoot) {
    const iconsData = existsSync(resolve(dsRoot, 'icons.json'))
      ? JSON.parse(readFileSync(resolve(dsRoot, 'icons.json'), 'utf8'))
      : {};
    try { dsm = captureIconUsage(resolve(dsRoot, 'src'), iconsData); } catch { dsm = null; }
  }

  return { securamark, dsm };
}

/** Absolute path to the (read-only) SecuraMark source, for cross-repo rendering. */
export function securamarkDir() {
  return process.env.SECURAMARK_DIR || join(homedir(), 'Projects/securamark-frontend');
}

/**
 * Curated SecuraMark components to render cross-repo. Reads the committed
 * registry (targets/securamark/components.json) and resolves each path to an
 * ABSOLUTE path under the SecuraMark source (the preview loads it via Vite's
 * dev-only `/@fs`). Empty if the source or registry is absent. `css` is filled in
 * by the ui command (it needs an async Tailwind compile).
 */
function buildSecuramark(paths) {
  const dir = securamarkDir();
  const regPath = paths.repoRoot ? resolve(paths.repoRoot, 'targets/securamark/components.json') : null;
  if (!dir || !existsSync(dir) || !regPath || !existsSync(regPath)) {
    return { dir: null, components: [], css: '' };
  }
  let components = [];
  try {
    const reg = JSON.parse(readFileSync(regPath, 'utf8'));
    components = (reg.components ?? []).map((c) => ({
      name: c.name,
      path: c.path,
      absPath: resolve(dir, c.path),
      description: c.description ?? '',
      status: c.status ?? 'stable',
      variants: c.variants ?? [],
      sizes: c.sizes ?? [],
      props: c.props ?? {},
      previewProps: c.previewProps ?? {},
      previewScenarios: Array.isArray(c.previewScenarios) ? c.previewScenarios : [],
      handlers: Array.isArray(c.handlers) ? c.handlers : [],
    }));
    const missing = components.filter((c) => !existsSync(c.absPath));
    if (missing.length) {
      console.warn(`preview-data: skipping SecuraMark components with missing source: ${missing.map((c) => c.name).join(', ')}`);
    }
    components = components.filter((c) => existsSync(c.absPath));
  } catch {
    components = [];
  }
  return { dir, components, css: '' };
}

/**
 * Assemble the full preview payload. `paths` is the object returned by
 * resolveProjectPaths() (tokensPath, componentsPath, dsRoot, repoRoot, buildDir).
 */
export function buildPreviewData(paths) {
  const securamarkTokensPath = paths.repoRoot
    ? resolve(paths.repoRoot, 'targets/securamark/tokens.json')
    : null;

  return {
    tokenSets: {
      dsm: buildDsmTokens(paths.tokensPath),
      securamark: buildSecuramarkTokens(securamarkTokensPath),
    },
    components: buildComponents(paths),
    cssVars: readCssVars(paths.buildDir),
    icons: buildIcons(paths),
    securamark: buildSecuramark(paths),
  };
}
