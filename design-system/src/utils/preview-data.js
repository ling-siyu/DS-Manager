import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { loadTokens } from './tokens.js';
import { discoverComponents, ownProps } from './component-discovery.js';
import { captureIconUsage } from './icons.js';
import { resolveCategory } from './categorize.js';

// Pure data layer for the preview. buildPreviewData() turns the on-disk token
// and component sources into a single JSON-serializable object the Vite app
// consumes via the `virtual:dsm-data` module. No Vite/React/DOM here — this is
// fully testable headless.
//
// The preview is single-source: it renders the CURRENT project's tokens and
// components (resolved from design-system/tokens.json + components.json). Every
// component is loaded cross-file via Vite's dev `/@fs` using its absolute path
// (fs-allowed in ui.js), so no per-source rendering split is needed.

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

/** Normalize one flattened token (resolved or raw DTCG) to a gallery item. */
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

/** The project's design tokens — loadTokens resolves references + sets cssVar. */
function buildTokens(tokensPath) {
  if (!tokensPath || !existsSync(tokensPath)) return [];
  try {
    const resolved = loadTokens(tokensPath);
    return Object.entries(resolved).map(([path, token]) => toGalleryItem(path, token));
  } catch (err) {
    // A malformed token file shouldn't take down the whole preview.
    console.warn(`preview-data: could not load tokens (${err.message})`);
    return [];
  }
}

/** Resolve a registry-relative component path to an absolute source file. Tries
 *  the project root first (the common case), then the design-system dir (DSM's
 *  own components when developing DSM itself). */
function toAbsPath(p, { repoRoot, dsRoot }) {
  for (const base of [repoRoot, dsRoot].filter(Boolean)) {
    const abs = resolve(base, p);
    if (existsSync(abs)) return abs;
  }
  return resolve(repoRoot ?? dsRoot ?? '.', p);
}

/**
 * Component matrix data: the curated registry (which carries previewProps /
 * previewScenarios / description) enriched with live discovery (authored props
 * via ownProps). Each entry gets an absolute source path for cross-file /@fs
 * rendering. Entries whose source file is missing are dropped.
 */
function buildComponents({ componentsPath, dsRoot, repoRoot }) {
  const registry = componentsPath && existsSync(componentsPath)
    ? JSON.parse(readFileSync(componentsPath, 'utf8'))
    : { components: [] };
  const entries = (registry.components ?? []).filter((c) => COMPONENT_FILE.test(c.path ?? ''));

  let byName = new Map();
  try { byName = discoverComponents(dsRoot).byName; } catch { byName = new Map(); }

  return entries
    .map((c) => {
      const discovered = byName.get(c.name);
      const props = discovered ? ownProps(discovered.props) : (c.props ?? {});
      const absPath = toAbsPath(c.path, { repoRoot, dsRoot });
      return {
        name: c.name,
        path: c.path,
        absPath,
        // Registry value wins (sync-components persists it); else derive now so
        // older registries without a category still group.
        category: resolveCategory({ path: c.path, absPath, explicit: c.category }),
        description: c.description ?? '',
        status: c.status ?? 'stable',
        variants: discovered?.variants?.length ? discovered.variants : (c.variants ?? []),
        sizes: discovered?.sizes?.length ? discovered.sizes : (c.sizes ?? []),
        props,
        // No-op these callback props so controlled inputs render without React's
        // "value without onChange" warning. Prefer explicit registry handlers,
        // else infer from on*-named props.
        handlers: Array.isArray(c.handlers) && c.handlers.length
          ? c.handlers
          : Object.keys(props).filter((k) => /^on[A-Z]/.test(k)),
        previewProps: c.previewProps ?? {},
        previewScenarios: Array.isArray(c.previewScenarios) ? c.previewScenarios : [],
      };
    })
    .filter((c) => existsSync(c.absPath));
}

function readCssVars(buildDir) {
  const cssPath = buildDir ? resolve(buildDir, 'css-vars.css') : null;
  if (!cssPath || !existsSync(cssPath)) return '';
  return readFileSync(cssPath, 'utf8');
}

/** Icon usage captured from the project's source, for the icon gallery. */
function buildIcons({ repoRoot, dsRoot }) {
  const root = repoRoot ?? dsRoot;
  if (!root) return null;
  try {
    const iconsData = existsSync(resolve(dsRoot, 'icons.json'))
      ? JSON.parse(readFileSync(resolve(dsRoot, 'icons.json'), 'utf8'))
      : {};
    return captureIconUsage(resolve(root, 'src'), iconsData);
  } catch {
    return null;
  }
}

/**
 * Optional project-supplied preview config — the analog of Storybook's
 * preview.tsx. A `design-system/preview.{tsx,jsx}` whose default export is a
 * decorator component `({ children, theme }) => ReactNode` lets the project wrap
 * every rendered component in its real providers (auth, i18n, data, …). Returns
 * the absolute path (loaded via /@fs inside the render iframe) or null.
 */
function resolveDecoratorPath({ dsRoot }) {
  if (!dsRoot) return null;
  for (const name of ['preview.tsx', 'preview.jsx']) {
    const abs = resolve(dsRoot, name);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Assemble the full preview payload. `paths` is the object returned by
 * resolveProjectPaths() (tokensPath, componentsPath, dsRoot, repoRoot, buildDir).
 * `projectCss` is filled in by the ui command (it needs an async Tailwind compile).
 */
export function buildPreviewData(paths) {
  return {
    tokens: buildTokens(paths.tokensPath),
    components: buildComponents(paths),
    cssVars: readCssVars(paths.buildDir),
    projectCss: '',
    decoratorPath: resolveDecoratorPath(paths),
    // Dark-first matches most design systems (and SecuraMark); the toolbar still
    // toggles light/dark.
    defaultTheme: 'dark',
    icons: buildIcons(paths),
  };
}
