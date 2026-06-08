import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { GalleryToken } from '../types';
import { asText, contrastText, kindOf } from '../lib/tokenKind';

function groupBy(tokens: GalleryToken[]): [string, GalleryToken[]][] {
  const map = new Map<string, GalleryToken[]>();
  for (const t of tokens) {
    if (!map.has(t.group)) map.set(t.group, []);
    map.get(t.group)!.push(t);
  }
  return [...map.entries()];
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="swatch" style={{ background: color, color: contrastText(color) }}>
      <span className="swatch-label">{label}</span>
      <span className="swatch-value">{color}</span>
    </div>
  );
}

function TokenSample({ token }: { token: GalleryToken }) {
  const kind = kindOf(token);
  const value = token.value;

  switch (kind) {
    case 'color': {
      const dark = asText(value);
      return (
        <div className="sample sample-colors">
          <Swatch color={dark} label={token.themeLight ? 'dark' : 'value'} />
          {token.themeLight && <Swatch color={token.themeLight} label="light" />}
        </div>
      );
    }
    case 'fontFamily':
      return (
        <p className="sample sample-type" style={{ fontFamily: asText(value) }}>
          The quick brown fox 敏捷
        </p>
      );
    case 'fontWeight':
      return (
        <p className="sample sample-type" style={{ fontWeight: asText(value) as CSSProperties['fontWeight'] }}>
          Weight {asText(value)}
        </p>
      );
    case 'fontSize':
      return (
        <p
          className="sample sample-type"
          style={{ fontSize: asText(value), lineHeight: token.lineHeight ?? 'normal' }}
        >
          {token.name} · Ag
        </p>
      );
    case 'typography': {
      const v = (value ?? {}) as Record<string, string | number>;
      const style: CSSProperties = {
        fontFamily: v.fontFamily as string,
        fontSize: v.fontSize as string,
        fontWeight: v.fontWeight as CSSProperties['fontWeight'],
        lineHeight: v.lineHeight as string,
        letterSpacing: v.letterSpacing as string,
      };
      return <p className="sample sample-type" style={style}>{token.name}</p>;
    }
    case 'spacing':
    case 'dimension':
      return (
        <div className="sample sample-bar">
          <span style={{ width: asText(value), maxWidth: '100%' }} />
          <code>{asText(value)}</code>
        </div>
      );
    case 'radius':
      return <div className="sample sample-radius" style={{ borderRadius: asText(value) }}><code>{asText(value)}</code></div>;
    case 'shadow':
      return <div className="sample sample-shadow" style={{ boxShadow: asText(value) }} />;
    case 'duration':
    case 'easing':
      return <code className="sample sample-mono">{asText(value)}</code>;
    default:
      return <code className="sample sample-mono">{asText(value)}</code>;
  }
}

export default function TokenGallery({
  tokens,
  showThemeVariants = false,
}: {
  tokens: GalleryToken[];
  showThemeVariants?: boolean;
}) {
  const groups = useMemo(() => groupBy(tokens), [tokens]);

  if (tokens.length === 0) {
    return <p className="empty">No tokens in this set.</p>;
  }

  return (
    <div className="gallery">
      {groups.map(([group, items]) => (
        <section key={group} className="token-group">
          <h2 className="group-title">
            {group} <span className="group-count">{items.length}</span>
          </h2>
          <div className="token-grid">
            {items.map((token) => (
              <div key={token.path} className="token-card" title={token.description ?? token.path}>
                <TokenSample token={token} />
                <div className="token-meta">
                  <span className="token-name">{token.name}</span>
                  {token.cssVar && <code className="token-var">{token.cssVar}</code>}
                  {showThemeVariants && token.themeLight && <span className="token-tag">dark / light</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
