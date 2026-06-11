import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewComponent, SecuraMarkComponent as SMComponent } from '../types';
import type { Theme } from '../App';
import LiveRender from './LiveRender';
import type { Source } from './LiveRender';
import Inspector from './Inspector';

// Figma-like canvas: components live together as frames on a pannable,
// zoomable surface. Click a frame to select it (inspector opens on the
// right); click the background or press Esc to deselect.

const WORLD_W = 1480;
const MIN_Z = 0.2;
const MAX_Z = 2.5;

interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Selection {
  component: PreviewComponent | SMComponent;
  scenarioIdx: number;
}

export function scenariosOf(component: PreviewComponent | SMComponent) {
  return component.previewScenarios.length
    ? component.previewScenarios
    : [{ name: 'Default', props: {} }];
}

function Frame({
  component,
  source,
  iconWeight,
  selected,
  selectedScenarioIdx,
  onSelect,
}: {
  component: PreviewComponent | SMComponent;
  source: Source;
  iconWeight?: string;
  selected: boolean;
  selectedScenarioIdx: number;
  onSelect: (scenarioIdx: number) => void;
}) {
  const scenarios = scenariosOf(component);
  return (
    <section
      className={`cframe${selected ? ' selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(selected ? selectedScenarioIdx : 0);
      }}
    >
      <header className="cframe-label">
        <span className={`status-dot status-${component.status}`} />
        <span className="cframe-name">{component.name}</span>
        <span className="cframe-count">{scenarios.length}</span>
      </header>
      <div className="cframe-body">
        {scenarios.map((s, i) => (
          <figure
            key={s.name}
            className={`cscenario${selected && i === selectedScenarioIdx ? ' on' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(i);
            }}
          >
            <div className="cscenario-stage">
              <LiveRender
                component={component}
                source={source}
                iconWeight={iconWeight}
                scenarioProps={s.props}
                resetKey={`${source}:${component.name}:${i}`}
              />
            </div>
            <figcaption className="cscenario-name">{s.name}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function ComponentCanvas({
  components,
  source,
  iconWeight,
  theme,
}: {
  components: (PreviewComponent | SMComponent)[];
  source: Source;
  iconWeight?: string;
  theme: Theme;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 24, y: 24, z: 1 });
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return components;
    return components.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q),
    );
  }, [components, query]);

  const fit = () => {
    const view = viewRef.current;
    if (!view) return;
    const { width } = view.getBoundingClientRect();
    const z = Math.min(1, Math.max(MIN_Z, (width - 64) / WORLD_W));
    setCamera({ x: Math.max(24, (width - WORLD_W * z) / 2), y: 24, z });
  };

  // Reset the camera + selection when the source library changes.
  useEffect(() => {
    setSelection(null);
    setQuery('');
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

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
          return {
            z,
            x: cx - ((cx - cam.x) / cam.z) * z,
            y: cy - ((cy - cam.y) / cam.z) * z,
          };
        });
      } else {
        setCamera((cam) => ({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY }));
      }
    };
    view.addEventListener('wheel', onWheel, { passive: false });
    return () => view.removeEventListener('wheel', onWheel);
  }, []);

  // Drag on empty canvas pans; a near-still click on it deselects. The active
  // drag's teardown is kept in a ref so unmounting mid-drag can't leak the
  // window listeners.
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanup.current?.(), []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('.cframe, .canvas-overlay')) return;
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
    const onUp = () => {
      stop();
      if (!moved) setSelection(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dragCleanup.current = stop;
  };

  // Esc: clear the search field when typing in it, otherwise deselect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('.canvas-search')) {
        setQuery('');
        active.blur();
      } else {
        setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const select = (component: PreviewComponent | SMComponent, scenarioIdx: number) =>
    setSelection({ component, scenarioIdx });

  return (
    <div className="canvas-shell">
      <div ref={viewRef} className="canvas-view" onPointerDown={onPointerDown}>
        <div className="canvas-overlay canvas-search">
          <input
            type="search"
            placeholder={`Search ${components.length} components…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search components"
          />
          {query && (
            <span className="canvas-search-count">
              {filtered.length}/{components.length}
            </span>
          )}
        </div>

        <div className="canvas-overlay canvas-zoom">
          <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
          <button className="canvas-zoom-pct" onClick={fit} title="Fit to view">
            {Math.round(camera.z * 100)}%
          </button>
          <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        </div>

        <div
          className="canvas-world"
          data-theme={theme}
          style={{
            width: WORLD_W,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`,
          }}
        >
          {filtered.length === 0 ? (
            <p className="empty">No components match “{query}”.</p>
          ) : (
            filtered.map((c) => (
              <Frame
                key={`${source}:${c.name}`}
                component={c}
                source={source}
                iconWeight={iconWeight}
                selected={selection?.component.name === c.name}
                selectedScenarioIdx={selection?.component.name === c.name ? selection.scenarioIdx : 0}
                onSelect={(i) => select(c, i)}
              />
            ))
          )}
        </div>
      </div>

      {selection && (
        <Inspector
          key={`${source}:${selection.component.name}`}
          component={selection.component}
          source={source}
          iconWeight={iconWeight}
          theme={theme}
          scenarioIdx={selection.scenarioIdx}
          onScenarioChange={(i) => setSelection({ component: selection.component, scenarioIdx: i })}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  );
}
