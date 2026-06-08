import type { GalleryToken } from '../types';
import type { Theme } from '../App';
import { asText, kindOf } from '../lib/tokenKind';

const GROUP_ORDER = [
  'color', 'primitive / color', 'semantic / color',
  'primitive / spacing', 'semantic / spacing',
  'border radius', 'semantic / shape', 'border width', 'box shadow', 'primitive / shadow',
  'aspect ratio', 'opacity', 'primitive / opacity',
  'animation duration', 'primitive / duration', 'animation easing', 'primitive / cubic bezier',
  'animation transition', 'semantic / motion',
  'icon size', 'primitive / icon', 'semantic / icon',
];

function groupRank(group: string): number {
  const i = GROUP_ORDER.indexOf(group.toLowerCase());
  return i === -1 ? GROUP_ORDER.length : i;
}

export function groupBy(tokens: GalleryToken[]): [string, GalleryToken[]][] {
  const map = new Map<string, GalleryToken[]>();
  for (const t of tokens) {
    if (!map.has(t.group)) map.set(t.group, []);
    map.get(t.group)!.push(t);
  }
  return [...map.entries()].sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b));
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Colors: dense, theme-aware swatch board (one group's items) ─────────────

export function SwatchBoard({ items, theme }: { items: GalleryToken[]; theme: Theme }) {
  return (
    <div className="swatch-board">
      {items.map((t) => {
        const active = theme === 'light' && t.themeLight ? t.themeLight : asText(t.value);
        const title = [t.path, `value ${asText(t.value)}`, t.themeLight ? `light ${t.themeLight}` : '', t.cssVar ?? '']
          .filter(Boolean).join('\n');
        return (
          <div key={t.path} className="swatch-chip" title={title}>
            <span className="chip-color" style={{ background: active }} />
            <div className="chip-meta">
              <span className="chip-name">{t.name}</span>
              <code className="chip-code">{active}</code>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Layout / Motion / Icons: list rows with a small visual + value ──────────

function rowValue(token: GalleryToken): string {
  if (token.value && typeof token.value === 'object' && !Array.isArray(token.value)) return '';
  return asText(token.value);
}

function RowSpecimen({ token }: { token: GalleryToken }) {
  const kind = kindOf(token);
  const value = token.value;
  switch (kind) {
    case 'radius':
      return <span className="spec-box" style={{ borderRadius: asText(value) }} />;
    case 'shadow':
      return <span className="spec-box spec-shadow" style={{ boxShadow: asText(value) }} />;
    case 'spacing':
    case 'dimension':
      return <span className="spec-bar" style={{ width: asText(value), maxWidth: '100%' }} />;
    default:
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return (
          <span className="spec-mono">
            {Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${asText(v)}`).join('  ·  ')}
          </span>
        );
      }
      return <code className="spec-mono">{asText(value)}</code>;
  }
}

export function TokenList({ tokens }: { tokens: GalleryToken[] }) {
  return (
    <ul className="token-list">
      {tokens.map((t) => (
        <li key={t.path} className="token-row" title={t.cssVar ?? t.path}>
          <span className="row-name">{t.name}</span>
          <div className="row-sample"><RowSpecimen token={t} /></div>
          <code className="row-value">{rowValue(t)}</code>
        </li>
      ))}
    </ul>
  );
}
