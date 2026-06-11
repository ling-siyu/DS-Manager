import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { PreviewComponent, SecuraMarkComponent as SMComponent } from '../types';
import type { Theme, Viewport } from '../App';
import RenderBoundary from './RenderBoundary';
import SecuraMarkComponent from './SecuraMarkComponent';
import { dsmLoaderFor as loaderFor } from './loaders';

const VIEWPORT_WIDTH: Record<Viewport, string> = { full: '100%', tablet: '768px', mobile: '375px' };

const NOOP = () => {};

/** No-op handlers for a SecuraMark component's declared callback props, so
 *  controlled inputs render without React's "value without onChange" warning. */
function handlerProps(component: PreviewComponent | SMComponent): Record<string, unknown> {
  const names = (component as SMComponent).handlers ?? [];
  return Object.fromEntries(names.map((h) => [h, NOOP]));
}

function DsmLive({ path, props }: { path: string; props: Record<string, unknown> }) {
  const [Comp, setComp] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const loader = loaderFor(path);
    if (!loader) {
      setError(`No source module found for ${path}`);
      return;
    }
    loader()
      .then((mod) => alive && setComp(() => mod.default))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [path]);

  if (error) return <div className="render-error">{error}</div>;
  if (!Comp) return <div className="render-loading">Loading…</div>;
  return <Comp {...props} />;
}

function ComponentCard({
  component,
  source,
  iconWeight,
  viewport,
}: {
  component: PreviewComponent | SMComponent;
  source: 'dsm' | 'securamark';
  iconWeight?: string;
  viewport: Viewport;
}) {
  const scenarios = component.previewScenarios.length
    ? component.previewScenarios
    : [{ name: 'Default', props: {} }];
  const [idx, setIdx] = useState(0);
  const selected = scenarios[Math.min(idx, scenarios.length - 1)];
  const props = {
    ...(source === 'securamark' ? handlerProps(component) : {}),
    ...component.previewProps,
    ...selected.props,
  };
  const ownProps = Object.entries(component.props);

  return (
    <section className="component-card">
      <header className="component-head">
        <div>
          <h2 className="component-name">{component.name}</h2>
          <p className="component-desc">{component.description}</p>
        </div>
        <span className={`status status-${component.status}`}>{component.status}</span>
      </header>

      <div className="component-controls">
        <label className="scenario-select">
          Scenario
          <select value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {scenarios.map((s, i) => (
              <option key={s.name} value={i}>{s.name}</option>
            ))}
          </select>
        </label>
        {component.variants.length > 0 && (
          <div className="variant-chips">
            {component.variants.map((v) => <span key={v} className="chip">{v}</span>)}
          </div>
        )}
      </div>

      <div className="canvas" style={{ maxWidth: VIEWPORT_WIDTH[viewport] }}>
        <RenderBoundary resetKey={`${source}:${component.name}:${idx}`}>
          {source === 'securamark' ? (
            <SecuraMarkComponent absPath={(component as SMComponent).absPath} props={props} iconWeight={iconWeight} />
          ) : (
            <DsmLive path={component.path} props={props} />
          )}
        </RenderBoundary>
      </div>

      {ownProps.length > 0 && (
        <details className="props-table">
          <summary>{ownProps.length} props</summary>
          <table>
            <tbody>
              {ownProps.map(([name, meta]) => (
                <tr key={name}>
                  <td className="prop-name">{name}{meta.required ? <span className="req">*</span> : null}</td>
                  <td className="prop-type">{meta.options ? meta.options.join(' | ') : meta.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

export default function ComponentMatrix({
  components,
  source,
  iconWeight,
  theme,
  viewport,
}: {
  components: (PreviewComponent | SMComponent)[];
  source: 'dsm' | 'securamark';
  iconWeight?: string;
  theme: Theme;
  viewport: Viewport;
}) {
  if (components.length === 0) {
    return <p className="empty">No {source === 'securamark' ? 'SecuraMark' : 'DSM'} components available.</p>;
  }
  return (
    <div className="matrix" data-theme={theme}>
      {components.map((c) => (
        <ComponentCard key={c.name} component={c} source={source} iconWeight={iconWeight} viewport={viewport} />
      ))}
    </div>
  );
}
