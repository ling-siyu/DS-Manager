import { existsSync, readFileSync } from 'fs';
import { globSync } from 'glob';
import { extname, relative, resolve } from 'path';

const DEFAULT_PATTERNS = [
  'src/components/**/*.{tsx,jsx,ts,js}',
  'src/components/ui/**/*.{tsx,jsx,ts,js}',
  'src/components/features/**/*.{tsx,jsx,ts,js}',
];

const IGNORE_PATTERNS = [
  '**/*.stories.*',
  '**/*.test.*',
  '**/*.spec.*',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/coverage/**',
];

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function findExportedNames(source) {
  const names = new Set();
  const cleaned = stripComments(source);
  const patterns = [
    /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=/g,
    /export\s+class\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s*\{\s*([^}]+)\s*\}/g,
    /const\s+([A-Z][A-Za-z0-9_]*)\s*=.*?export\s+default\s+\1/gs,
    /function\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{[\s\S]*?export\s+default\s+\1/gs,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(cleaned)) !== null) {
      if (pattern.source.includes('export\\s*\\{')) {
        const entries = match[1]
          .split(',')
          .map((value) => value.trim().split(/\s+as\s+/i).pop()?.trim())
          .filter((value) => /^[A-Z]/.test(value || ''));
        entries.forEach((entry) => names.add(entry));
        continue;
      }

      names.add(match[1]);
    }
  }

  return [...names];
}

function extractTypeBlock(source, typeName) {
  const interfaceMatch = source.match(new RegExp(`(?:export\\s+)?interface\\s+${typeName}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  if (interfaceMatch) return interfaceMatch[1];

  const typeMatch = source.match(new RegExp(`(?:export\\s+)?type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  if (typeMatch) return typeMatch[1];

  return '';
}

function toPropType(rawType) {
  const normalized = rawType.trim().replace(/\s+/g, ' ');
  if (/^(?:string|number|boolean)$/.test(normalized)) return normalized;
  if (/=>/.test(normalized)) return 'function';
  if (/ReactNode|JSX\.Element|ReactElement/.test(normalized)) return 'ReactNode';
  if (/\|/.test(normalized)) return 'string';
  return normalized || 'unknown';
}

function parsePropsBlock(block) {
  const props = {};
  const variants = new Set();
  const sizes = new Set();

  for (const line of block.split('\n')) {
    const match = line.trim().match(/^([A-Za-z0-9_]+)(\?)?\s*:\s*([^;]+);?$/);
    if (!match) continue;

    const [, name, optionalMarker, rawType] = match;
    const options = rawType
      .split('|')
      .map((part) => part.trim())
      .filter((part) => /^['"`][^'"`]+['"`]$/.test(part))
      .map((part) => part.slice(1, -1));

    if (name === 'variant') options.forEach((value) => variants.add(value));
    if (name === 'size') options.forEach((value) => sizes.add(value));

    props[name] = {
      type: toPropType(rawType),
      ...(options.length ? { options } : {}),
      ...(optionalMarker ? {} : { required: true }),
    };
  }

  return {
    props,
    variants: [...variants],
    sizes: [...sizes],
  };
}

function inferPropsForComponent(source, componentName) {
  const propTypeNames = [
    `${componentName}Props`,
    'Props',
  ];

  for (const typeName of propTypeNames) {
    const block = extractTypeBlock(source, typeName);
    if (!block) continue;
    return parsePropsBlock(block);
  }

  return {
    props: {},
    variants: [],
    sizes: [],
  };
}

function looksRenderableReactComponent(source, componentName, filePath) {
  const extension = extname(filePath);
  if (extension === '.jsx' || extension === '.tsx') return true;

  const markers = [
    `<${componentName}`,
    'return (',
    'return <',
    'React.createElement',
    'from \'react\'',
    'from "react"',
  ];

  return markers.some((marker) => source.includes(marker));
}

export function discoverComponents(repoRoot, options = {}) {
  const patterns = options.patterns?.length ? options.patterns : DEFAULT_PATTERNS;
  const files = unique(patterns.flatMap((pattern) => globSync(pattern, {
    cwd: repoRoot,
    absolute: true,
    ignore: IGNORE_PATTERNS,
  })));

  const discovered = [];
  const byName = new Map();

  for (const filePath of files) {
    if (!existsSync(filePath)) continue;

    let source;
    try {
      source = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const exportedNames = findExportedNames(source);
    for (const name of exportedNames) {
      if (!looksRenderableReactComponent(source, name, filePath)) continue;

      const inferred = inferPropsForComponent(source, name);
      const component = {
        name,
        path: relative(repoRoot, filePath).replace(/\\/g, '/'),
        props: inferred.props,
        variants: inferred.variants,
        sizes: inferred.sizes,
        discoveredFrom: relative(repoRoot, filePath).replace(/\\/g, '/'),
      };

      discovered.push(component);
      byName.set(name, component);
    }
  }

  return {
    components: discovered
      .sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path)),
    byName,
    scannedPatterns: patterns,
  };
}

export function resolveComponentSourcePath(repoRoot, componentPath) {
  return resolve(repoRoot, componentPath);
}
