import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import { loadFromFs } from './loaders';
import { data } from '../data';

// Each component renders inside its OWN <iframe> document. That isolation is what
// gives Storybook-grade fidelity: the project's REAL global stylesheet (Tailwind
// preflight + @layer base resets + @theme + fonts) applies in full, exactly like
// the app — yet none of it (the `*{border-radius:0!important}` reset, the
// html/body rules) can leak out and clobber the DSM chrome. The component and the
// project's provider decorator mount with the host's (deduped) React, so hooks,
// context, and events work across the iframe boundary.

type Decorator = ComponentType<{ children: ReactNode; theme?: string }>;

// Load the project's optional preview decorator (design-system/preview.tsx) once
// and share the promise across every frame.
let decoratorPromise: Promise<Decorator | null> | undefined;
function loadDecorator(): Promise<Decorator | null> {
  if (!data.decoratorPath) return Promise.resolve(null);
  if (!decoratorPromise) {
    decoratorPromise = loadFromFs(data.decoratorPath)
      .then((m) => ((m as { default?: Decorator }).default ?? null))
      .catch(() => null);
  }
  return decoratorPromise;
}

/** Copy the host's @font-face rules into the iframe so bundled fonts resolve
 *  there (font-face declarations are per-document). */
function cloneFonts(dest: Document) {
  document.querySelectorAll('style').forEach((s) => {
    if (s.textContent && s.textContent.includes('@font-face')) {
      const c = dest.createElement('style');
      c.textContent = s.textContent;
      dest.head.appendChild(c);
    }
  });
}

function stableKey(props: Record<string, unknown>): string {
  try {
    // Functions (no-op handlers) serialize to undefined and drop out — fine, they
    // are stable across renders and shouldn't trigger a rebuild.
    return JSON.stringify(props);
  } catch {
    return Object.keys(props).join(',');
  }
}

export default function ProjectComponent({
  absPath,
  props,
  iconWeight,
  theme = 'dark',
  freezeMotion = false,
  eager = false,
  onReady,
}: {
  absPath: string;
  props: Record<string, unknown>;
  iconWeight?: string;
  theme?: string;
  /** Kill animations/transitions inside the frame (for deterministic screenshots). */
  freezeMotion?: boolean;
  /** Mount immediately instead of waiting to scroll into view (stage/inspector). */
  eager?: boolean;
  /** Called once the component has mounted and settled (screenshot readiness). */
  onReady?: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(eager);
  const [height, setHeight] = useState(56);
  const [error, setError] = useState('');
  const propsKey = useMemo(() => stableKey(props), [props]);

  // Lazy-mount: only build a frame once it scrolls near the viewport, so a wall
  // of 70+ components doesn't spin up 70 React roots at once.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || visible || eager) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const iframe = frameRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    let alive = true;
    let root: Root | null = null;
    let ro: ResizeObserver | null = null;
    setError('');

    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    doc.close();

    const base = doc.createElement('style');
    base.textContent = `html,body{margin:0}${
      freezeMotion ? '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' : ''
    }`;
    doc.head.appendChild(base);
    const proj = doc.createElement('style');
    proj.setAttribute('data-project-css', '');
    proj.textContent = data.projectCss || '';
    doc.head.appendChild(proj);
    cloneFonts(doc);
    // Dark is the project default (absence of [data-theme=light]); only the light
    // override needs the attribute, but we set it explicitly for clarity.
    doc.documentElement.setAttribute('data-theme', theme);

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    root = createRoot(container);

    const measure = () => {
      if (alive) setHeight(Math.max(1, doc.documentElement.scrollHeight));
    };

    (async () => {
      try {
        const [mod, Decorator] = await Promise.all([loadFromFs(absPath), loadDecorator()]);
        if (!alive || !root) return;
        const Comp = (mod as { default?: ComponentType<Record<string, unknown>> }).default;
        if (!Comp) throw new Error(`${absPath} has no default export`);
        const inner = createElement(
          IconContext.Provider,
          { value: { weight: (iconWeight as never) ?? 'regular' } },
          createElement(Comp, props),
        );
        root.render(Decorator ? createElement(Decorator, { theme, children: inner }) : inner);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            measure();
            onReady?.();
          }),
        );
        ro = new ResizeObserver(measure);
        ro.observe(doc.documentElement);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      alive = false;
      ro?.disconnect();
      const r = root;
      root = null;
      // Defer unmount past the current commit to avoid React's "unmount while
      // rendering" warning when the parent re-renders.
      queueMicrotask(() => r?.unmount());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, absPath, theme, iconWeight, propsKey, freezeMotion]);

  if (error) return <div className="render-error">{error}</div>;
  return (
    <iframe
      ref={frameRef}
      title={absPath}
      className="render-iframe"
      scrolling="no"
      style={{ width: '100%', height, border: 0, display: 'block', overflow: 'hidden', colorScheme: 'normal' }}
    />
  );
}
