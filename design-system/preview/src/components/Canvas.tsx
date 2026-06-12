import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Theme } from '../App';
import type { PreviewComponent } from '../types';

// Content-agnostic Figma-like surface: frames laid out together on a pannable,
// zoomable world. Frames carry arbitrary nodes (a component render, or a token
// section); selectable frames open the inspector via onSelect.

const WORLD_W = 1280;
const MIN_Z = 0.2;
const MAX_Z = 2.5;
// Keep the default view clear of the floating docks: content starts right of the
// left nav panel and below the top search bar.
const SAFE_LEFT = 216;
const SAFE_TOP = 92;

interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface CanvasFrame {
  id: string;
  label: string;
  variant: 'component' | 'token' | 'section';
  node: ReactNode;
  count?: number;
  status?: string;
  selectable?: boolean;
}

/** Scenarios for a component, defaulting to a single "Default" when none. */
export function scenariosOf(component: PreviewComponent) {
  return component.previewScenarios.length
    ? component.previewScenarios
    : [{ name: 'Default', props: {} }];
}

function Frame({
  frame,
  selected,
}: {
  frame: CanvasFrame;
  selected: boolean;
}) {
  // A section frame is a full-width category band (header only), not a card.
  if (frame.variant === 'section') {
    return (
      <div className="cframe section">
        <span className="section-name">{frame.label}</span>
        {frame.count != null && <span className="section-count">{frame.count}</span>}
        <span className="section-rule" />
      </div>
    );
  }
  // Selection is handled centrally by the canvas pointer handler (which
  // distinguishes a click from a pan) via the data-frame-id below — so a click
  // selects, but a drag that starts on a card still pans.
  return (
    <section
      className={`cframe ${frame.variant}${selected ? ' selected' : ''}${frame.selectable ? ' selectable' : ''}`}
      data-frame-id={frame.selectable ? frame.id : undefined}
    >
      <header className="cframe-label">
        {frame.status && <span className={`status-dot status-${frame.status}`} />}
        <span className="cframe-name">{frame.label}</span>
        {frame.count != null && <span className="cframe-count">{frame.count}</span>}
      </header>
      <div className="cframe-body">{frame.node}</div>
    </section>
  );
}

export default function Canvas({
  frames,
  selectedId,
  onSelect,
  theme,
  resetKey,
  controls,
}: {
  frames: CanvasFrame[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  theme: Theme;
  /** Camera refits when this changes (route / source switch), not on filtering. */
  resetKey: string;
  /** Rendered in the bottom dock, to the left of the zoom controls. */
  controls?: ReactNode;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 24, y: 24, z: 1 });

  const fit = () => {
    const view = viewRef.current;
    if (!view) return;
    const { width } = view.getBoundingClientRect();
    const avail = width - SAFE_LEFT - 24;
    const z = Math.min(1, Math.max(MIN_Z, avail / WORLD_W));
    // Left-align past the nav; center within the remaining width when content is narrow.
    setCamera({ x: SAFE_LEFT + Math.max(0, (avail - WORLD_W * z) / 2), y: SAFE_TOP, z });
  };

  // Refit when the content set changes (route/source), not while searching.
  useEffect(fit, [resetKey]);

  // Wheel: pinch / ctrl+wheel zooms at the cursor, plain wheel pans.
  // Native non-passive listener — React's delegated onWheel can't preventDefault.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = view.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setCamera((cam) => {
          const z = Math.min(MAX_Z, Math.max(MIN_Z, cam.z * Math.exp(-e.deltaY * 0.01)));
          return { z, x: cx - ((cx - cam.x) / cam.z) * z, y: cy - ((cy - cam.y) / cam.z) * z };
        });
      } else {
        setCamera((cam) => ({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY }));
      }
    };
    view.addEventListener('wheel', onWheel, { passive: false });
    return () => view.removeEventListener('wheel', onWheel);
  }, []);

  // Drag on empty canvas pans; a near-still click on it deselects. Active-drag
  // teardown is kept in a ref so unmounting mid-drag can't leak window listeners.
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanup.current?.(), []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't hijack the floating dock controls (zoom / theme). Everything else —
    // including component cards — can start a pan; a click (no movement) selects.
    if ((e.target as Element).closest('.canvas-overlay')) return;
    const start = { px: e.clientX, py: e.clientY, cx: camera.x, cy: camera.y };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) setCamera((cam) => ({ ...cam, x: start.cx + dx, y: start.cy + dy }));
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragCleanup.current = null;
    };
    const onUp = (ev: PointerEvent) => {
      stop();
      if (moved) return; // a pan, not a click
      const frameEl = (ev.target as Element | null)?.closest?.('.cframe.selectable');
      onSelect(frameEl?.getAttribute('data-frame-id') ?? null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dragCleanup.current = stop;
  };

  // Esc deselects, unless focus is in an input (search owns its own Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      onSelect(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelect]);

  const zoomBy = (factor: number) => {
    const view = viewRef.current;
    if (!view) return;
    const rect = view.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setCamera((cam) => {
      const z = Math.min(MAX_Z, Math.max(MIN_Z, cam.z * factor));
      return { z, x: cx - ((cx - cam.x) / cam.z) * z, y: cy - ((cy - cam.y) / cam.z) * z };
    });
  };

  return (
    <div ref={viewRef} className="canvas-view" onPointerDown={onPointerDown}>
      <div
        className="canvas-world"
        data-theme={theme}
        style={{ width: WORLD_W, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})` }}
      >
        {frames.length === 0 ? (
          <p className="empty">Nothing to show here.</p>
        ) : (
          frames.map((f) => (
            <Frame key={f.id} frame={f} selected={selectedId === f.id} />
          ))
        )}
      </div>

      <div className="canvas-overlay canvas-dock-bottom">
        {controls}
        <div className="canvas-zoom">
          <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
          <button className="canvas-zoom-pct" onClick={fit} title="Fit to view">
            {Math.round(camera.z * 100)}%
          </button>
          <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        </div>
      </div>
    </div>
  );
}
