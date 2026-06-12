import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PreviewComponent, PreviewPropMeta } from '../types';
import type { Theme } from '../App';
import LiveRender from './LiveRender';
import { scenariosOf } from './Canvas';
import { synthesizeProps } from '../lib/placeholders';

// Right-hand inspector for the selected canvas component: a project-themed live
// preview, editable props (tweak state on the fly), and a responsive viewport.
// The panel width is drag-resizable; the responsive frame scales to fit it.

type Tab = 'inspect' | 'responsive';

const DEVICES = [
  { id: 'mobile', label: 'Mobile', width: 375 },
  { id: 'tablet', label: 'Tablet', width: 768 },
] as const;

const MIN_W = 300;

/** Strip quotes TS union members carry, e.g. `"'md'"` → `md`. */
function unquote(s: string): string {
  return s.replace(/^['"]|['"]$/g, '');
}

/** Whether a prop can be edited with a simple control (vs. a complex object). */
function isEditable(meta: PreviewPropMeta): boolean {
  if (meta.options?.length) return true;
  const t = (meta.type ?? '').toLowerCase();
  return t === 'boolean' || t === 'string' || t === 'number' || t === 'string | number' || t === 'number | string';
}

/** An input appropriate to a prop's type, editing into the overrides map. */
function PropControl({
  meta,
  value,
  onChange,
}: {
  meta: PreviewPropMeta;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (meta.options?.length) {
    return (
      <select className="prop-input" value={String(value ?? '')} onChange={(e) => onChange(unquote(e.target.value))}>
        {meta.options.map((o) => {
          const v = unquote(o);
          return <option key={v} value={v}>{v}</option>;
        })}
      </select>
    );
  }
  const t = (meta.type ?? '').toLowerCase();
  if (t === 'boolean') {
    return <input type="checkbox" className="prop-check" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (t.includes('number')) {
    return (
      <input
        type="number"
        className="prop-input"
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    );
  }
  return (
    <input
      type="text"
      className="prop-input"
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Render children at an exact device width, scaled down to fit `available`. */
function ScaledViewport({
  width,
  available,
  children,
}: {
  width: number;
  available: number;
  children: React.ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const scale = Math.min(1, available / width);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight * scale);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scale]);

  return (
    <div className="viewport-scaler" style={{ height: height || undefined }}>
      <div ref={innerRef} className="viewport-frame" style={{ width, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

export default function Inspector({
  component,
  iconWeight,
  theme,
  scenarioIdx,
  onScenarioChange,
  onClose,
  width,
  onWidth,
}: {
  component: PreviewComponent;
  iconWeight?: string;
  theme: Theme;
  scenarioIdx: number;
  onScenarioChange: (idx: number) => void;
  onClose: () => void;
  width: number;
  onWidth: (w: number) => void;
}) {
  const [tab, setTab] = useState<Tab>('inspect');
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const scenarios = scenariosOf(component);
  const scenario = scenarios[Math.min(scenarioIdx, scenarios.length - 1)];
  const ownProps = Object.entries(component.props);

  // A new base scenario clears manual prop edits.
  useEffect(() => setOverrides({}), [scenarioIdx]);

  // The props actually rendered = base (synthesized + authored + scenario) with
  // the user's live edits on top.
  const effective = { ...synthesizeProps(component), ...component.previewProps, ...scenario.props, ...overrides };
  const liveProps = { ...scenario.props, ...overrides };
  const setProp = (name: string, v: unknown) => setOverrides((o) => ({ ...o, [name]: v }));

  // Measure the available content width so the responsive frame fits the panel.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(width - 32);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const update = () => setAvail(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: PointerEvent) => {
      const max = window.innerWidth - 48;
      onWidth(Math.min(Math.max(MIN_W, startW + (startX - ev.clientX)), max));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <aside className="inspector" data-theme={theme} style={{ width }}>
      <div className="inspector-resize" onPointerDown={startResize} aria-label="Resize panel" role="separator" />
      <header className="inspector-head">
        <div className="inspector-title">
          <h2>{component.name}</h2>
          <span className={`status status-${component.status}`}>{component.status}</span>
        </div>
        <button className="inspector-close" onClick={onClose} aria-label="Close inspector">×</button>
      </header>
      {component.description && <p className="inspector-desc">{component.description}</p>}

      <div className="seg inspector-tabs" role="tablist">
        <button role="tab" className={tab === 'inspect' ? 'on' : ''} onClick={() => setTab('inspect')}>
          Inspect
        </button>
        <button role="tab" className={tab === 'responsive' ? 'on' : ''} onClick={() => setTab('responsive')}>
          Responsive
        </button>
      </div>

      {tab === 'inspect' ? (
        <div className="inspector-body" ref={bodyRef}>
          <div className="inspector-stage">
            <LiveRender
              component={component}
              iconWeight={iconWeight}
              theme={theme}
              scenarioProps={liveProps}
              resetKey={`inspect:${component.name}:${scenarioIdx}`}
            />
          </div>

          <h3 className="inspector-section">Variations</h3>
          <div className="inspector-scenarios">
            {scenarios.map((s, i) => (
              <button
                key={s.name}
                className={`scenario-pill${i === scenarioIdx ? ' on' : ''}`}
                onClick={() => onScenarioChange(i)}
              >
                {s.name}
              </button>
            ))}
          </div>

          {component.variants.length > 0 && (
            <>
              <h3 className="inspector-section">Variants</h3>
              <div className="variant-chips">
                {component.variants.map((v) => <span key={v} className="chip">{v}</span>)}
              </div>
            </>
          )}
          {component.sizes.length > 0 && (
            <>
              <h3 className="inspector-section">Sizes</h3>
              <div className="variant-chips">
                {component.sizes.map((s) => <span key={s} className="chip">{s}</span>)}
              </div>
            </>
          )}

          {ownProps.length > 0 && (
            <>
              <h3 className="inspector-section">Props ({ownProps.length})</h3>
              <table className="inspector-props">
                <tbody>
                  {ownProps.map(([name, meta]) => (
                    <tr key={name}>
                      <td className="prop-name">{name}{meta.required ? <span className="req">*</span> : null}</td>
                      <td className="prop-ctl">
                        {isEditable(meta) ? (
                          <PropControl meta={meta} value={effective[name]} onChange={(v) => setProp(name, v)} />
                        ) : (
                          <span className="prop-type">{meta.options ? meta.options.join(' | ') : meta.type}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : (
        <div className="inspector-body" ref={bodyRef}>
          <div className="seg" role="group" aria-label="Device width">
            {DEVICES.map((d) => (
              <button key={d.id} className={device.id === d.id ? 'on' : ''} onClick={() => setDevice(d)}>
                {d.label} · {d.width}
              </button>
            ))}
          </div>
          <p className="inspector-hint">
            {scenario.name} at {device.width}px{avail < device.width ? `, scaled ×${(avail / device.width).toFixed(2)}` : ''}
          </p>
          <ScaledViewport width={device.width} available={avail}>
            <LiveRender
              component={component}
              iconWeight={iconWeight}
              theme={theme}
              scenarioProps={liveProps}
              resetKey={`responsive:${component.name}:${scenarioIdx}:${device.id}`}
            />
          </ScaledViewport>
        </div>
      )}
    </aside>
  );
}
