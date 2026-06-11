import { useLayoutEffect, useRef, useState } from 'react';
import type { PreviewComponent, SecuraMarkComponent as SMComponent } from '../types';
import type { Theme } from '../App';
import LiveRender from './LiveRender';
import type { Source } from './LiveRender';
import { scenariosOf } from './Canvas';

// Right-hand inspector for the selected canvas component: variations + props,
// or a device-width viewport rendering the component responsively.

type Tab = 'inspect' | 'responsive';

const DEVICES = [
  { id: 'mobile', label: 'Mobile', width: 375 },
  { id: 'tablet', label: 'Tablet', width: 768 },
] as const;

/** Render children at an exact device width, scaled down to fit the column.
 *  The wrapper height tracks the scaled content via ResizeObserver. */
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
      <div
        ref={innerRef}
        className="viewport-frame"
        style={{ width, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

export default function Inspector({
  component,
  source,
  iconWeight,
  theme,
  scenarioIdx,
  onScenarioChange,
  onClose,
}: {
  component: PreviewComponent | SMComponent;
  source: Source;
  iconWeight?: string;
  theme: Theme;
  scenarioIdx: number;
  onScenarioChange: (idx: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('inspect');
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const scenarios = scenariosOf(component);
  const scenario = scenarios[Math.min(scenarioIdx, scenarios.length - 1)];
  const ownProps = Object.entries(component.props);
  // Inspector column inner width (360 panel − 2×16 padding).
  const AVAILABLE = 328;

  return (
    <aside className="inspector" data-theme={theme}>
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
        <div className="inspector-body">
          <div className="inspector-stage">
            <LiveRender
              component={component}
              source={source}
              iconWeight={iconWeight}
              scenarioProps={scenario.props}
              resetKey={`inspect:${source}:${component.name}:${scenarioIdx}`}
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
                      <td className="prop-type">{meta.options ? meta.options.join(' | ') : meta.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : (
        <div className="inspector-body">
          <div className="seg" role="group" aria-label="Device width">
            {DEVICES.map((d) => (
              <button key={d.id} className={device.id === d.id ? 'on' : ''} onClick={() => setDevice(d)}>
                {d.label} · {d.width}
              </button>
            ))}
          </div>
          <p className="inspector-hint">
            {scenario.name} at {device.width}px{AVAILABLE < device.width ? `, scaled ×${(AVAILABLE / device.width).toFixed(2)}` : ''}
          </p>
          <ScaledViewport width={device.width} available={AVAILABLE}>
            <LiveRender
              component={component}
              source={source}
              iconWeight={iconWeight}
              scenarioProps={scenario.props}
              resetKey={`responsive:${source}:${component.name}:${scenarioIdx}:${device.id}`}
            />
          </ScaledViewport>
        </div>
      )}
    </aside>
  );
}
