import { readFileSync } from 'fs';

export function flattenTokens(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
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
  const raw = JSON.parse(readFileSync(tokensPath, 'utf8'));
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
