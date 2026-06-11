import { useEffect, useState } from 'react';
import { IconContext } from '@phosphor-icons/react';
import { data } from './data';
import RenderBoundary from './components/RenderBoundary';
import { dsmLoaderFor, loadFromFs } from './components/loaders';
import type { LoadedComponent } from './components/loaders';
import type { PreviewComponent, SecuraMarkComponent } from './types';

// The screenshot stage: #/stage/<source>/<name>?scenario=<i>[&theme=light]
// Renders exactly ONE component scenario with no chrome, kills all motion, and
// sets data-stage-ready="true" once the component is mounted and fonts are
// loaded — the edit loop's puppeteer waits on that attribute (or .render-error).

const STAGE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
  body { margin: 0; background: #f6f7f9; }
  .stage {
    width: 800px;
    box-sizing: border-box;
    padding: 48px;
    min-height: 200px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f6f7f9;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .render-error { color: #dc2626; font-size: 13px; font-family: ui-monospace, monospace; }
`;

interface StageTarget {
  source: 'dsm' | 'securamark';
  component: PreviewComponent | SecuraMarkComponent;
  props: Record<string, unknown>;
  iconWeight?: string;
}

function parseStage(): StageTarget | { error: string } {
  const raw = window.location.hash.replace(/^#\/stage\//, '');
  const [pathPart, query = ''] = raw.split('?');
  const [source, encodedName] = pathPart.split('/');
  const name = decodeURIComponent(encodedName ?? '');
  const params = new URLSearchParams(query);

  if (source !== 'dsm' && source !== 'securamark') {
    return { error: `Unknown stage source "${source}" (expected dsm|securamark)` };
  }
  const list: (PreviewComponent | SecuraMarkComponent)[] =
    source === 'securamark' ? data.securamark.components : data.components;
  const component = list.find((c) => c.name === name);
  if (!component) {
    return { error: `Unknown ${source} component "${name}"` };
  }

  const scenarios = component.previewScenarios.length
    ? component.previewScenarios
    : [{ name: 'Default', props: {} }];
  const idx = Number.parseInt(params.get('scenario') ?? '0', 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= scenarios.length) {
    return { error: `Scenario index ${params.get('scenario')} out of range (0–${scenarios.length - 1}) for ${name}` };
  }

  const handlers =
    source === 'securamark'
      ? Object.fromEntries(((component as SecuraMarkComponent).handlers ?? []).map((h) => [h, () => {}]))
      : {};
  return {
    source,
    component,
    props: { ...handlers, ...component.previewProps, ...scenarios[idx].props },
    iconWeight: data.icons?.securamark?.style?.weight ?? 'light',
  };
}

export default function StagePage() {
  const [target] = useState(parseStage);
  const [Comp, setComp] = useState<LoadedComponent | null>(null);
  const [error, setError] = useState('error' in target ? target.error : '');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if ('error' in target) return;
    let alive = true;
    const loader =
      target.source === 'securamark'
        ? () => loadFromFs((target.component as SecuraMarkComponent).absPath)
        : dsmLoaderFor(target.component.path);
    if (!loader) {
      setError(`No source module found for ${target.component.path}`);
      return;
    }
    loader()
      .then((mod) => {
        if (!alive) return;
        if (!mod.default) throw new Error(`${target.component.name} has no default export`);
        setComp(() => mod.default);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [target]);

  // Readiness: component mounted + fonts loaded + two frames settled.
  useEffect(() => {
    if (!Comp) return;
    let alive = true;
    document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (alive) setReady(true);
        });
      });
    });
    return () => {
      alive = false;
    };
  }, [Comp]);

  return (
    <>
      <style>{STAGE_CSS}</style>
      <div className="stage" data-theme="light" data-stage-ready={ready ? 'true' : undefined}>
        {error ? (
          <div className="render-error">{error}</div>
        ) : !Comp ? (
          <div className="render-loading" />
        ) : (
          <RenderBoundary resetKey="stage">
            <IconContext.Provider value={{ weight: ('error' in target ? 'regular' : target.iconWeight) as never }}>
              <Comp {...('error' in target ? {} : target.props)} />
            </IconContext.Provider>
          </RenderBoundary>
        )}
      </div>
    </>
  );
}
