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

export function resolveReference(ref, flat) {
  const inner = ref.replace(/^\{|\}$/g, '');
  return flat[inner]?.$value ?? ref;
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
