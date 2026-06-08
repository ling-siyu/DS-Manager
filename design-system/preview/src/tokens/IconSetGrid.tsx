import type { ComponentType } from 'react';
import * as PhosphorIcons from '@phosphor-icons/react';
import * as LucideIcons from 'lucide-react';
import type { IconCapture } from '../types';

// The actual icon libraries (public npm packages) — DSM renders a project's used
// icons directly, no cross-repo import needed. Namespace import pulls the whole
// set; acceptable for a local dev preview.
const LIBRARIES: Record<string, Record<string, unknown>> = {
  phosphor: PhosphorIcons as unknown as Record<string, unknown>,
  lucide: LucideIcons as unknown as Record<string, unknown>,
};

// A renderable icon is a function component or a forwardRef/memo object
// (icon libraries use forwardRef). Anything else (a stray non-component export)
// must NOT be passed to JSX or React throws.
function isRenderable(c: unknown): c is ComponentType<{ size?: number; weight?: string }> {
  return typeof c === 'function' || (typeof c === 'object' && c !== null && '$$typeof' in c);
}

export default function IconSetGrid({ capture }: { capture: IconCapture }) {
  const lib = (capture.set && LIBRARIES[capture.set]) || {};
  const weight = capture.style?.weight ?? undefined;

  return (
    <div className="icon-set">
      <p className="icon-set-meta">
        <code>{capture.source}</code>
        {capture.style?.weight ? <span className="chip">weight: {capture.style.weight}</span> : null}
        <span className="icon-set-note">imported icons, as used in the product</span>
      </p>
      <div className="icon-grid">
        {capture.icons.map((icon) => {
          const Cmp = lib[icon.name];
          return (
            <div key={icon.name} className="icon-cell" title={`${icon.name} · ${icon.count} use${icon.count !== 1 ? 's' : ''}`}>
              <div className="icon-glyph">
                {isRenderable(Cmp) ? <Cmp size={26} weight={capture.set === 'phosphor' ? weight : undefined} /> : <span className="icon-missing">?</span>}
              </div>
              <span className="icon-name">{icon.name}</span>
              <span className="icon-count">{icon.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
