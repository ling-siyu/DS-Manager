import type { CSSProperties } from 'react';
import type { GalleryToken } from '../types';
import { asText } from '../lib/tokenKind';

// Specimen lines exercise both scripts so Latin (Inter/Aleo/M PLUS Code) and CJK
// (Noto Sans SC) render together, the way they appear in a real product.
const LATIN = 'Secure assets stay legible under pressure.';
const CJK = '安全资产在高压场景下依然清晰可读。';
const SHORT = 'Ag 安全 0123';

const familyOf = (value: unknown) => (Array.isArray(value) ? value.join(', ') : asText(value));
const firstFamily = (value: unknown) =>
  Array.isArray(value) ? String(value[0]).replace(/"/g, '') : asText(value);

export function FamiliesBlock({ tokens }: { tokens: GalleryToken[] }) {
  return (
    <div className="typo-families">
      {tokens.map((t) => {
        const family = familyOf(t.value);
        return (
          <div key={t.path} className="typo-family">
            <div className="typo-family-head">
              <span className="row-name">{t.name}</span>
              <code className="spec-mono">{family}</code>
            </div>
            <p className="typo-line" style={{ fontFamily: family }}>{LATIN}</p>
            <p className="typo-line" style={{ fontFamily: family }}>{CJK}</p>
          </div>
        );
      })}
    </div>
  );
}

export function TypeScaleBlock({ tokens }: { tokens: GalleryToken[] }) {
  return (
    <ul className="typo-list">
      {tokens.map((t) => (
        <li key={t.path} className="typo-row">
          <span className="row-name">{t.name}</span>
          <span className="typo-spec" style={{ fontSize: asText(t.value), lineHeight: t.lineHeight ?? 'normal' }}>{SHORT}</span>
          <code className="row-value">{asText(t.value)}{t.lineHeight ? ` / ${t.lineHeight}` : ''}</code>
        </li>
      ))}
    </ul>
  );
}

export function WeightsBlock({ tokens }: { tokens: GalleryToken[] }) {
  return (
    <ul className="typo-list">
      {tokens.map((t) => (
        <li key={t.path} className="typo-row">
          <span className="row-name">{t.name}</span>
          <span className="typo-spec typo-spec-md" style={{ fontWeight: asText(t.value) as CSSProperties['fontWeight'] }}>{SHORT}</span>
          <code className="row-value">{asText(t.value)}</code>
        </li>
      ))}
    </ul>
  );
}

export function TrackingBlock({ tokens }: { tokens: GalleryToken[] }) {
  return (
    <ul className="typo-list">
      {tokens.map((t) => (
        <li key={t.path} className="typo-row">
          <span className="row-name">{t.name}</span>
          <span className="typo-spec typo-spec-md" style={{ letterSpacing: asText(t.value) }}>TRACKING 字距 0123</span>
          <code className="row-value">{asText(t.value)}</code>
        </li>
      ))}
    </ul>
  );
}

export function SemanticBlock({ tokens }: { tokens: GalleryToken[] }) {
  return (
    <div className="typo-semantic">
      {tokens.map((t) => {
        const v = (t.value ?? {}) as Record<string, unknown>;
        const style: CSSProperties = {
          fontFamily: familyOf(v.fontFamily),
          fontSize: v.fontSize as string,
          fontWeight: v.fontWeight as CSSProperties['fontWeight'],
          lineHeight: v.lineHeight as string,
          letterSpacing: v.letterSpacing as string,
          textTransform: v.textTransform as CSSProperties['textTransform'],
        };
        return (
          <div key={t.path} className="typo-style">
            <div className="typo-style-specimen">
              <p className="typo-line" style={style}>{LATIN}</p>
              <p className="typo-line" style={style}>{CJK}</p>
              {t.description && <p className="typo-usage">{t.description}</p>}
            </div>
            <div className="typo-style-spec">
              <div className="row-name">{t.name}</div>
              <code className="spec-mono">
                {firstFamily(v.fontFamily)} · {asText(v.fontSize)} · {asText(v.fontWeight)}
              </code>
              {v.letterSpacing ? <code className="spec-mono">tracking {asText(v.letterSpacing)}</code> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
