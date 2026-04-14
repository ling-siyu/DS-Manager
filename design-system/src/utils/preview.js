import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, extname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_UI_REACT_APP_PATH = resolve(PACKAGE_ROOT, 'src/ui-react/PreviewApp.jsx');
const PACKAGE_UI_REACT_FRAME_CSS_PATH = resolve(PACKAGE_ROOT, 'src/ui-react/frame.css');
const PACKAGE_NODE_MODULES = resolve(PACKAGE_ROOT, 'node_modules');

const PREVIEW_CONFIG_FILES = [
  'preview.config.js',
  'preview.config.mjs',
  'preview.adapter.js',
  'preview.adapter.mjs',
];

function escapeForInlineJSON(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

function sanitizeError(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  return error.message || String(error);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSerializable(value) {
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}

function normalizeScenarioList(scenarios, componentName, errors) {
  if (!Array.isArray(scenarios)) return [];

  return scenarios.reduce((items, scenario, index) => {
    if (!isPlainObject(scenario)) {
      errors.push(`${componentName}: preview scenario at index ${index} must be an object.`);
      return items;
    }

    const name = String(scenario.name || `Scenario ${index + 1}`).trim();
    const props = isPlainObject(scenario.props) ? scenario.props : {};

    if (!isSerializable(props)) {
      errors.push(`${componentName}: preview scenario "${name}" must be JSON-serializable.`);
      return items;
    }

    items.push({
      name,
      props: JSON.parse(JSON.stringify(props)),
    });

    return items;
  }, []);
}

function sanitizeDefaults(defaults, knownNames, errors) {
  if (!isPlainObject(defaults)) return {};

  return Object.entries(defaults).reduce((items, [componentName, value]) => {
    if (!knownNames.has(componentName)) return items;

    if (!isPlainObject(value) || !isSerializable(value)) {
      errors.push(`${componentName}: adapter defaults must be a JSON-serializable object.`);
      return items;
    }

    items[componentName] = JSON.parse(JSON.stringify(value));
    return items;
  }, {});
}

function buildComponentPreviewMetadata(component, summary, componentHealth = {}) {
  const errors = [];
  const previewProps = isPlainObject(component.previewProps) && isSerializable(component.previewProps)
    ? JSON.parse(JSON.stringify(component.previewProps))
    : {};

  if (component.previewProps && Object.keys(previewProps).length === 0 && !isSerializable(component.previewProps)) {
    errors.push(`${component.name}: previewProps must be JSON-serializable.`);
  }

  const previewScenarios = normalizeScenarioList(component.previewScenarios, component.name, errors);
  const hasAdapterMapping = summary.availableComponents.includes(component.name);
  const sourceExists = componentHealth.sourceExists === true;
  const exportDetected = componentHealth.exportDetected === true;
  const missingDependencies = componentHealth.missingDependencies || [];
  const hasPreviewData = Object.keys(previewProps).length > 0 || previewScenarios.length > 0;
  const renderable = summary.status === 'ready' && hasAdapterMapping && sourceExists;

  let previewMode = 'metadata-only';
  let reason = 'No React preview mapping was found for this component.';

  if (sourceExists) {
    previewMode = 'source-backed-metadata';
    reason = exportDetected
      ? 'DSM found the source file, but this component is still being shown from metadata.'
      : 'DSM found the source file, but could not confidently detect a renderable component export.';
  }

  if (renderable) {
    previewMode = 'live-render';
    reason = 'Rendering the registered React component through the preview adapter.';
  } else if (!sourceExists) {
    reason = 'The registry path does not currently resolve to a source file in this repo.';
  } else if (summary.status !== 'ready' && hasAdapterMapping) {
    reason = summary.reason;
  } else if (hasAdapterMapping && !hasPreviewData) {
    reason = 'A source-backed component was found, but no preview props or scenarios were registered.';
  }

  if (!hasPreviewData) {
    errors.push(`${component.name}: no previewProps or previewScenarios are registered.`);
  }

  const statusBadges = [
    !sourceExists ? 'Missing source path' : 'Source file found',
    renderable ? 'Preview renderable' : (sourceExists ? 'Metadata only' : 'Metadata only'),
    ...(missingDependencies.length ? ['Contains unresolved dependencies'] : []),
  ];

  return {
    mode: previewMode,
    available: hasAdapterMapping,
    iframePath: renderable ? `/preview/component/${encodeURIComponent(component.name)}` : null,
    adapterDefaults: summary.defaults?.[component.name] || {},
    previewProps,
    previewScenarios,
    previewSlots: Array.isArray(component.previewSlots) ? component.previewSlots : [],
    previewNotes: typeof component.previewNotes === 'string' ? component.previewNotes : '',
    reason,
    renderable,
    sourceExists,
    exportDetected,
    metadataOnly: !renderable,
    missingDependencies,
    statusBadges,
    errors,
  };
}

export function getPreviewConfigCandidates(paths) {
  return PREVIEW_CONFIG_FILES.map((name) => resolve(paths.dsRoot, name));
}

export function resolvePreviewConfigPath(paths) {
  return getPreviewConfigCandidates(paths).find((filePath) => existsSync(filePath)) || null;
}

export async function loadPreviewSummary(paths, components) {
  const configPath = resolvePreviewConfigPath(paths);
  const componentNames = new Set((components || []).map((component) => component.name));

  if (!configPath) {
    return {
      framework: null,
      mode: 'metadata-only',
      status: 'disabled',
      reason: 'Add design-system/preview.config.js to enable live React previews.',
      modeLabel: 'Metadata only',
      configPath: null,
      availableComponents: [],
      defaults: {},
      hasProviders: false,
      hasDecorators: false,
      errors: [],
      warnings: [],
    };
  }

  let adapterModule;
  try {
    adapterModule = await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`);
  } catch (error) {
    return {
      framework: null,
      mode: 'metadata-only',
      status: 'error',
      reason: 'DSM found a preview adapter, but it could not be loaded.',
      modeLabel: 'Metadata only',
      configPath,
      availableComponents: [],
      defaults: {},
      hasProviders: false,
      hasDecorators: false,
      errors: [sanitizeError(error)],
      warnings: [],
    };
  }

  const adapter = adapterModule.default ?? adapterModule;
  if (!isPlainObject(adapter)) {
    return {
      framework: null,
      mode: 'metadata-only',
      status: 'error',
      reason: 'Preview adapter must export a default object.',
      modeLabel: 'Metadata only',
      configPath,
      availableComponents: [],
      defaults: {},
      hasProviders: false,
      hasDecorators: false,
      errors: ['The preview adapter default export is not an object.'],
      warnings: [],
    };
  }

  const warnings = [];
  const errors = [];

  if (adapter.framework !== 'react') {
    return {
      framework: String(adapter.framework || ''),
      mode: 'metadata-only',
      status: 'error',
      reason: `Preview framework "${String(adapter.framework || 'unknown')}" is not supported yet.`,
      modeLabel: 'Metadata only',
      configPath,
      availableComponents: [],
      defaults: {},
      hasProviders: false,
      hasDecorators: false,
      errors: [],
      warnings: [],
    };
  }

  if (!isPlainObject(adapter.components)) {
    errors.push('Preview adapter must include a "components" object.');
  }

  const mappedComponents = Object.entries(adapter.components || {}).reduce((items, [name, loader]) => {
    if (!componentNames.has(name)) {
      warnings.push(`Preview adapter maps "${name}", but it is not registered in components.json.`);
      return items;
    }

    if (typeof loader !== 'function') {
      errors.push(`Preview adapter entry "${name}" must be a function that returns an import().`);
      return items;
    }

    items.push(name);
    return items;
  }, []);

  const defaults = sanitizeDefaults(adapter.defaults, componentNames, errors);

  return {
    framework: 'react',
    mode: errors.length ? 'source-backed-metadata' : 'source-backed-metadata',
    status: errors.length ? 'error' : 'configured',
    reason: errors.length
      ? 'React preview adapter is present, but DSM found configuration issues.'
      : 'React preview adapter detected.',
    modeLabel: errors.length ? 'Source-backed metadata' : 'Source-backed metadata',
    configPath,
    availableComponents: mappedComponents.sort((left, right) => left.localeCompare(right)),
    defaults,
    hasProviders: typeof adapter.renderProviders === 'function',
    hasDecorators: Array.isArray(adapter.decorators) && adapter.decorators.length > 0,
    errors,
    warnings,
  };
}

export async function buildPreviewBundle(paths, summary) {
  if (summary.framework !== 'react' || summary.status === 'disabled') {
    return {
      status: summary.status,
      reason: summary.reason,
      assets: new Map(),
      errors: [...summary.errors],
    };
  }

  if (summary.status === 'error') {
    return {
      status: 'error',
      reason: summary.reason,
      assets: new Map(),
      errors: [...summary.errors],
    };
  }

  let esbuild;
  try {
    ({ build: esbuild } = await import('esbuild'));
  } catch {
    return {
      status: 'missing-dependency',
      reason: 'Install esbuild to enable the React preview client.',
      assets: new Map(),
      errors: ['Missing dependency: esbuild'],
    };
  }

  const tempDir = join(tmpdir(), `dsm-preview-${Date.now()}`);
  const entryPath = join(tempDir, 'entry.jsx');

  mkdirSync(tempDir, { recursive: true });
  writeFileSync(entryPath, `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import PreviewApp from ${JSON.stringify(PACKAGE_UI_REACT_APP_PATH)};
    import adapter from ${JSON.stringify(summary.configPath)};

    const root = createRoot(document.getElementById('root'));
    root.render(React.createElement(PreviewApp, {
      adapter,
      boot: window.__DSM_PREVIEW_DATA__ || {},
    }));
  `);

  try {
    const result = await esbuild({
      absWorkingDir: PACKAGE_ROOT,
      assetNames: 'assets/[name]-[hash]',
      bundle: true,
      chunkNames: 'chunks/[name]-[hash]',
      entryNames: 'main',
      entryPoints: [entryPath],
      format: 'esm',
      jsx: 'automatic',
      loader: {
        '.js': 'jsx',
        '.mjs': 'jsx',
      },
      nodePaths: [
        PACKAGE_NODE_MODULES,
        resolve(paths.repoRoot, 'node_modules'),
      ],
      outdir: 'out',
      platform: 'browser',
      splitting: true,
      sourcemap: 'inline',
      target: ['es2020'],
      write: false,
    });

    const assets = new Map();
    for (const outputFile of result.outputFiles || []) {
      const relativePath = outputFile.path.split('/out/').pop() || basename(outputFile.path);
      const extension = extname(relativePath);
      const contentType = extension === '.js'
        ? 'application/javascript; charset=utf-8'
        : extension === '.css'
          ? 'text/css; charset=utf-8'
          : 'application/octet-stream';

      assets.set(`/${relativePath}`, {
        content: Buffer.from(outputFile.contents),
        contentType,
      });
    }

    return {
      status: 'ready',
      reason: 'React preview bundle compiled successfully.',
      assets,
      errors: [],
    };
  } catch (error) {
    const esbuildErrors = Array.isArray(error.errors)
      ? error.errors.map((entry) => entry.text || sanitizeError(entry))
      : [sanitizeError(error)];

    return {
      status: 'error',
      reason: 'DSM could not bundle the React preview client.',
      assets: new Map(),
      errors: esbuildErrors,
    };
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

export async function loadPreviewRuntime(paths, components) {
  const summary = await loadPreviewSummary(paths, components);
  const bundle = await buildPreviewBundle(paths, summary);

  const resolvedSummary = {
    ...summary,
    status: bundle.status === 'ready' ? 'ready' : summary.status === 'disabled' ? 'disabled' : bundle.status,
    mode: bundle.status === 'ready' ? 'live-render' : summary.mode,
    modeLabel: bundle.status === 'ready'
      ? 'Live render available'
      : summary.modeLabel || 'Metadata only',
    reason: bundle.reason || summary.reason,
    errors: [...summary.errors, ...bundle.errors],
  };

  return {
    assets: bundle.assets,
    summary: resolvedSummary,
  };
}

export function decorateComponentsWithPreview(components, previewSummary, diagnosticsByName = {}) {
  return (components || []).map((component) => ({
    ...component,
    preview: buildComponentPreviewMetadata(component, previewSummary, diagnosticsByName[component.name] || {}),
  }));
}

export function renderPreviewFrameHTML({ component, previewSummary, tokenStyles, frameStyles }) {
  const boot = {
    component,
    preview: component.preview,
    summary: {
      framework: previewSummary.framework,
      mode: previewSummary.mode,
      status: previewSummary.status,
      reason: previewSummary.reason,
      configPath: previewSummary.configPath,
      warnings: previewSummary.warnings,
      errors: previewSummary.errors,
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${component.name} Preview</title>
  <style>${tokenStyles}</style>
  <style>${frameStyles}</style>
  <script>window.__DSM_PREVIEW_DATA__=${escapeForInlineJSON(boot)};</script>
</head>
<body>
  <div id="root"></div>
  ${component.preview.mode === 'live-render' && previewSummary.status === 'ready'
    ? '<script type="module" src="/preview-assets/main.js"></script>'
    : ''}
</body>
</html>`;
}

export function loadPreviewFrameStyles(paths) {
  const stylePath = PACKAGE_UI_REACT_FRAME_CSS_PATH;
  return existsSync(stylePath) ? readFileSync(stylePath, 'utf8') : '';
}
