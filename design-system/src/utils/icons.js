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
