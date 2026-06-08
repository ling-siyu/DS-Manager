import type { GalleryToken } from '../types';

export type TokenKind =
  | 'color'
  | 'fontFamily'
  | 'fontWeight'
  | 'typography'
  | 'fontSize'
  | 'radius'
  | 'spacing'
  | 'dimension'
  | 'shadow'
  | 'duration'
  | 'easing'
  | 'other';

/** Pick a black/white label color for a hex background by luminance. */
export function contrastText(value: unknown): string {
  const m = /^#?([0-9a-f]{6})/i.exec(String(value ?? '').trim());
  if (!m) return 'var(--p-text)';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  return lum > 0.55 ? '#111111' : '#ffffff';
}

/** Classify a token into a render kind, using $type plus path hints. */
export function kindOf(token: GalleryToken): TokenKind {
  const type = String(token.type ?? '').toLowerCase();
  const path = token.path.toLowerCase();

  if (type === 'color') return 'color';
  if (type === 'fontfamily') return 'fontFamily';
  if (type === 'fontweight') return 'fontWeight';
  if (type === 'typography') return 'typography';
  if (type === 'shadow') return 'shadow';
  if (type === 'duration') return 'duration';
  if (type === 'cubicbezier') return 'easing';

  if (type === 'dimension' || type === 'number') {
    if (/fontsize/.test(path)) return 'fontSize';
    if (/radius/.test(path)) return 'radius';
    if (/spacing/.test(path)) return 'spacing';
    return 'dimension';
  }
  return 'other';
}

export function asText(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}
