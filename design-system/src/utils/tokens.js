import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

/**
 * Deep-merge token objects. Child values win over base values at every level.
 * Skips the top-level "extends" key — that's metadata, not a token group.
 */
function mergeTokens(base, child) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(child)) {
    if (key === 'extends') continue;
    if (
      value && typeof value === 'object' && !('$value' in value) &&
      result[key] && typeof result[key] === 'object' && !('$value' in result[key])
    ) {
      result[key] = mergeTokens(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Load and merge a tokens.json file, following any "extends" chain.
 * Supports relative paths: "extends": "./path/to/base-tokens.json"
 */
export function loadRawTokens(tokensPath) {
  const raw = JSON.parse(readFileSync(tokensPath, 'utf8'));

  if (!raw.extends) return raw;

  const basePath = resolve(dirname(tokensPath), raw.extends);
  if (!existsSync(basePath)) {
    throw new Error(
      `tokens.json "extends" points to a file that does not exist: ${basePath}`
    );
  }

  const base = loadRawTokens(basePath); // recursive — supports multi-level chains
  return mergeTokens(base, raw);
}

export function flattenTokens(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'extends') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && '$value' in value) {
      result[path] = value;
    } else if (value && typeof value === 'object') {
      Object.assign(result, flattenTokens(value, path));
    }
  }
  return result;
}

/**
 * Resolve a `{path.to.token}` alias to its final value, following transitive
 * chains (an alias whose value is itself another alias) all the way down.
 *
 * Returns the original `ref` if the path is unknown (unchanged from the old
 * single-level behavior). A `seen` set guards against reference cycles: if a
 * token is revisited, we stop and return its raw (still-aliased) value rather
 * than recursing forever. Composite ($value is an object) resolution is handled
 * by the build pipeline, not here — callers only pass string refs.
 */
export function resolveReference(ref, flat, seen = new Set()) {
  const inner = ref.replace(/^\{|\}$/g, '');
  const target = flat[inner];
  if (!target) return ref;        // unknown reference — leave as-is
  const value = target.$value;
  if (typeof value !== 'string' || !value.startsWith('{')) return value;
  if (seen.has(inner)) return value;   // cycle — stop before infinite recursion
  seen.add(inner);
  return resolveReference(value, flat, seen);
}

/** Normalize a hex color for value matching: lowercase, expand #abc → #aabbcc.
 *  Returns null for alpha forms (#abcd / #rrggbbaa) — those never match tokens. */
export function normalizeHex(value) {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(String(value).trim());
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6) return null; // 4- and 8-digit carry alpha
  return `#${hex}`;
}

/**
 * Reverse lookup: normalized hex value → candidate tokens [{ path, cssVar }],
 * semantic.* candidates first. The fixer only auto-applies unambiguous matches;
 * ambiguity (e.g. #ffffff backing several semantic roles) is surfaced to the
 * driving agent, which knows the usage context.
 */
export function buildValueIndex(resolvedTokens) {
  const index = new Map();
  for (const [path, token] of Object.entries(resolvedTokens)) {
    const hex = normalizeHex(token.resolvedValue);
    if (!hex) continue;
    if (!index.has(hex)) index.set(hex, []);
    index.get(hex).push({ path, cssVar: token.cssVar });
  }
  const rank = (p) => (p.startsWith('semantic.') ? 0 : p.startsWith('component.') ? 1 : 2);
  for (const candidates of index.values()) {
    candidates.sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  }
  return index;
}

export function loadTokens(tokensPath) {
  const raw = loadRawTokens(tokensPath);
  const flat = flattenTokens(raw);
  const resolved = {};
  for (const [path, token] of Object.entries(flat)) {
    const rawVal = token.$value;
    resolved[path] = {
      ...token,
      cssVar: `--ds-${path.replace(/\./g, '-')}`,
      resolvedValue: typeof rawVal === 'string' && rawVal.startsWith('{')
        ? resolveReference(rawVal, flat)
        : rawVal,
    };
  }
  return resolved;
}
