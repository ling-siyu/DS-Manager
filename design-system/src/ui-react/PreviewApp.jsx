import React, { useEffect, useState } from 'react';
import PreviewCanvas from './PreviewCanvas.jsx';
import PreviewErrorBoundary from './PreviewErrorBoundary.jsx';
import { formatDiagnostics, getMergedProps } from './controls.js';

function pickExport(moduleValue, componentName) {
  if (typeof moduleValue === 'function') return moduleValue;
  if (typeof moduleValue?.default === 'function') return moduleValue.default;
  if (typeof moduleValue?.[componentName] === 'function') return moduleValue[componentName];
  const candidate = Object.values(moduleValue || {}).find((value) => typeof value === 'function');
  return candidate || null;
}

function applyProviders(adapter, child, componentName, props) {
  if (typeof adapter?.renderProviders !== 'function') return child;
  return adapter.renderProviders({ children: child, componentName, props });
}

function applyDecorators(adapter, child, componentName, props) {
  if (!Array.isArray(adapter?.decorators)) return child;

  return adapter.decorators.reduce((output, decorator) => {
    if (typeof decorator !== 'function') return output;
    return decorator({ children: output, componentName, props });
  }, child);
}

export default function PreviewApp({ adapter, boot }) {
  const component = boot?.component || {};
  const summary = boot?.summary || {};
  const [componentModule, setComponentModule] = useState(null);
  const [status, setStatus] = useState(component?.preview?.mode === 'react' ? 'loading' : 'fallback');
  const [error, setError] = useState('');
  const [scenarioId, setScenarioId] = useState('__default__');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (component?.preview?.mode !== 'react') {
        setStatus('fallback');
        return;
      }

      const loader = adapter?.components?.[component.name];
      if (typeof loader !== 'function') {
        setStatus('fallback');
        setError('No preview loader was registered for this component.');
        return;
      }

      setStatus('loading');
      setError('');

      try {
        const moduleValue = await loader();
        if (cancelled) return;

        const resolved = pickExport(moduleValue, component.name);
        if (!resolved) {
          throw new Error(`Could not find a React component export for ${component.name}.`);
        }

        setComponentModule(() => resolved);
        setStatus('ready');
      } catch (loadError) {
        if (cancelled) return;
        setComponentModule(null);
        setStatus('error');
        setError(loadError.message || 'Failed to load component preview.');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [adapter, component?.name, component?.preview?.mode]);

  const { props, selected, scenarios } = getMergedProps(component, scenarioId);
  const diagnostics = formatDiagnostics(summary, component);

  let content = (
    <section className="preview-card">
      <p className="preview-eyebrow">Fallback</p>
      <h2 className="preview-title">Metadata preview only</h2>
      <p className="preview-copy">{component?.preview?.reason || summary.reason}</p>
    </section>
  );

  if (status === 'loading') {
    content = <PreviewCanvas status="Loading" message="Loading the React component through the preview adapter..." />;
  } else if (status === 'error') {
    content = <PreviewCanvas status="Error" message={error || 'Preview failed to load.'} />;
  } else if (status === 'ready' && componentModule) {
    const element = React.createElement(componentModule, props);
    const wrapped = applyDecorators(adapter, applyProviders(adapter, element, component.name, props), component.name, props);

    content = (
      <PreviewErrorBoundary resetKey={`${component.name}:${selected.id}`}>
        <PreviewCanvas status="Ready" message={component?.preview?.reason}>
          {wrapped}
        </PreviewCanvas>
      </PreviewErrorBoundary>
    );
  }

  return (
    <main className="preview-shell">
      <header className="preview-card preview-card-hero">
        <p className="preview-eyebrow">DSM React Preview</p>
        <h1 className="preview-title">{component.name}</h1>
        <p className="preview-copy">
          {summary.configPath
            ? `Adapter: ${summary.configPath}`
            : 'No preview adapter configured.'}
        </p>
      </header>

      <section className="preview-card">
        <div className="preview-card-head">
          <div>
            <p className="preview-eyebrow">Preset</p>
            <h2 className="preview-title">Preview props</h2>
          </div>
          <select
            className="preview-select"
            aria-label="Preview scenario"
            value={scenarioId}
            onChange={(event) => setScenarioId(event.target.value)}
          >
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>{scenario.label}</option>
            ))}
          </select>
        </div>
        <pre className="preview-code">{JSON.stringify(props, null, 2)}</pre>
      </section>

      {content}

      {diagnostics.length ? (
        <section className="preview-card">
          <p className="preview-eyebrow">Diagnostics</p>
          <h2 className="preview-title">Preview notes</h2>
          <ul className="preview-list">
            {diagnostics.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
