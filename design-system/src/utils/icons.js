import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte']);
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', '.turbo', 'out', '.output',
]);

function walkDir(dir, files = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return files; }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }
    if (stat.isDirectory()) {
      walkDir(fullPath, files);
    } else if (SOURCE_EXTENSIONS.has(extname(entry).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

/** PascalCase → kebab-case  e.g. ChevronDown → chevron-down, XMLParser → xml-parser */
function toKebab(name) {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Extract Lucide component names from import statements.
 * Handles: import { Search, X as Close, ChevronDown } from 'lucide-react'
 */
function extractLucideImports(content) {
  const names = new Set();
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && /^[A-Z]/.test(name)) names.add(name);
    }
  }
  return [...names];
}

/**
 * Extract Material Symbols icon names from JSX/HTML.
 * Handles: <span class="material-symbols-outlined">search</span>
 * and className="material-symbols-outlined">icon_name<
 */
function extractMaterialSymbols(content) {
  const names = new Set();
  const re = /material-symbols-(?:outlined|rounded|sharp)[^>]*>\s*([a-z][a-z0-9_]*)\s*</g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim();
    if (name) names.add(name);
  }
  return [...names];
}

// Named exports of @phosphor-icons/react that are NOT icons.
const PHOSPHOR_NON_ICONS = new Set(['IconContext', 'IconBase', 'Icon', 'SSRProvider']);

/**
 * Extract Phosphor icon names from import statements.
 * Handles: import { Lock, X as Close } from '@phosphor-icons/react'
 */
function extractPhosphorImports(content) {
  const names = new Set();
  const re = /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"]@phosphor-icons\/react['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && /^[A-Z]/.test(name) && !PHOSPHOR_NON_ICONS.has(name)) names.add(name);
    }
  }
  return [...names];
}

// Import-statement extractors keyed by set id.
const SET_EXTRACTORS = {
  phosphor: extractPhosphorImports,
  lucide: extractLucideImports,
};

/** Best-effort detection of a project's global icon style (Phosphor IconContext weight). */
function detectIconWeight(files) {
  for (const filePath of files) {
    let content;
    try { content = readFileSync(filePath, 'utf8'); } catch { continue; }
    const m = content.match(/IconContext[\s\S]{0,120}?weight:\s*['"](\w+)['"]/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Capture a project's icon usage: detect the primary icon set, its style, and the
 * actually-imported icons (with per-file usage counts). This is the icon analogue
 * of the token importer — it reads which icons a project pulls from its set.
 *
 * Returns { set, source, style: { weight }, icons: [{ name, count }] }.
 */
export function captureIconUsage(repoRoot, iconsData = {}) {
  const files = walkDir(repoRoot);
  const usage = { phosphor: new Map(), lucide: new Map() };

  for (const filePath of files) {
    let content;
    try { content = readFileSync(filePath, 'utf8'); } catch { continue; }
    // Strip block comments so documented/example imports (e.g. in JSDoc) don't
    // count as real usage.
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [set, extract] of Object.entries(SET_EXTRACTORS)) {
      for (const name of extract(content)) {
        usage[set].set(name, (usage[set].get(name) ?? 0) + 1);
      }
    }
  }

  // Primary set = the one with the most distinct icons used.
  let set = null;
  let max = 0;
  for (const [s, m] of Object.entries(usage)) {
    if (m.size > max) { max = m.size; set = s; }
  }
  if (!set) return { set: null, source: null, style: {}, icons: [] };

  const meta = iconsData.sets?.[set] ?? {};
  const weight = (set === 'phosphor' ? detectIconWeight(files) : null) ?? meta.defaultWeight ?? null;
  const icons = [...usage[set].entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { set, source: meta.source ?? null, style: { weight }, icons };
}

/**
 * Scan project source files for icon usage.
 * Returns an array of { set, lucideId, lucideName, materialName, alias, files }.
 */
export function scanIconUsage(repoRoot, iconsData) {
  const files = walkDir(repoRoot);

  // Build reverse lookup maps
  const lucideToAlias = {};      // "ChevronDown" → "chevron-down"
  const materialToAlias = {};    // "keyboard_arrow_down" → "chevron-down"
  const aliases = iconsData.aliases || {};

  for (const [alias, mapping] of Object.entries(aliases)) {
    if (mapping.lucide)                lucideToAlias[mapping.lucide] = alias;
    if (mapping['material-symbols'])   materialToAlias[mapping['material-symbols']] = alias;
  }

  // name → Set<relPath>
  const lucideUsage    = new Map();
  const materialUsage  = new Map();

  for (const filePath of files) {
    let content;
    try { content = readFileSync(filePath, 'utf8'); } catch { continue; }
    const relPath = relative(repoRoot, filePath);

    for (const name of extractLucideImports(content)) {
      if (!lucideUsage.has(name)) lucideUsage.set(name, new Set());
      lucideUsage.get(name).add(relPath);
    }
    for (const name of extractMaterialSymbols(content)) {
      if (!materialUsage.has(name)) materialUsage.set(name, new Set());
      materialUsage.get(name).add(relPath);
    }
  }

  const results = [];

  for (const [lucideName, fileSet] of lucideUsage) {
    const alias    = lucideToAlias[lucideName] || null;
    const lucideId = toKebab(lucideName);
    results.push({
      set: 'lucide',
      lucideId,
      lucideName,
      materialName: alias ? aliases[alias]?.['material-symbols'] || null : null,
      alias,
      files: [...fileSet].sort(),
    });
  }

  for (const [materialName, fileSet] of materialUsage) {
    // Skip if already captured via a lucide import for the same alias
    const alias = materialToAlias[materialName] || null;
    if (alias && lucideUsage.has(aliases[alias]?.lucide)) continue;

    const lucideNameFromAlias = alias ? aliases[alias]?.lucide || null : null;
    results.push({
      set: 'material-symbols',
      lucideId: lucideNameFromAlias ? toKebab(lucideNameFromAlias) : null,
      lucideName: lucideNameFromAlias || null,
      materialName,
      alias,
      files: [...fileSet].sort(),
    });
  }

  return results.sort((a, b) => {
    const aKey = a.alias || a.lucideId || a.materialName || '';
    const bKey = b.alias || b.lucideId || b.materialName || '';
    return aKey.localeCompare(bKey);
  });
}
