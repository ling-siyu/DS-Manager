import React, { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { PreviewComponent } from '../types';
import type { Theme, Viewport } from '../App';

// Vite resolves DSM's own components statically via glob (they live outside the
// preview root; ui.js allows fs access). Cross-repo SecuraMark components are a
// later pass.
const LOADERS = import.meta.glob('../../../src/components/ui/*.tsx') as Record<
  string,
  () => Promise<{ default: ComponentType<Record<string, unknown>> }>
>;

function loaderFor(path: string) {
  const base = path.split('/').pop();
  const key = Object.keys(LOADERS).find((k) => k.endsWith(`/${base}`));
  return key ? LOADERS[key] : null;
}

const VIEWPORT_WIDTH: Record<Viewport, string> = {
  full: '100%',
  tablet: '768px',
  mobile: '375px',
};

class RenderBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { error: string }
> {
  state = { error: '' };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: '' });
  }
  render() {
    return this.state.error ? (
      <div className="render-error">Render error: {this.state.error}</div>
    ) : (
      this.props.children
    );
  }
}

function LiveComponent({ path, props }: { path: string; props: Record<string, unknown> }) {
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

function ComponentCard({ component, viewport }: { component: PreviewComponent; viewport: Viewport }) {
  const scenarios = component.previewScenarios.length
    ? component.previewScenarios
    : [{ name: 'Default', props: {} }];
  const [idx, setIdx] = useState(0);
  const selected = scenarios[Math.min(idx, scenarios.length - 1)];
  const props = { ...component.previewProps, ...selected.props };
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
              <option key={s.name} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {component.variants.length > 0 && (
          <div className="variant-chips">
            {component.variants.map((v) => (
              <span key={v} className="chip">
                {v}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="canvas" style={{ maxWidth: VIEWPORT_WIDTH[viewport] }}>
        <RenderBoundary resetKey={`${component.name}:${idx}`}>
          <LiveComponent path={component.path} props={props} />
        </RenderBoundary>
      </div>

      {ownProps.length > 0 && (
        <details className="props-table">
          <summary>{ownProps.length} authored props</summary>
          <table>
            <tbody>
              {ownProps.map(([name, meta]) => (
                <tr key={name}>
                  <td className="prop-name">
                    {name}
                    {meta.required ? <span className="req">*</span> : null}
                  </td>
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
  theme,
  viewport,
}: {
  components: PreviewComponent[];
  theme: Theme;
  viewport: Viewport;
}) {
  if (components.length === 0) return <p className="empty">No components in the registry.</p>;
  return (
    <div className="matrix" data-theme={theme}>
      {components.map((c) => (
        <ComponentCard key={c.name} component={c} viewport={viewport} />
      ))}
    </div>
  );
}
