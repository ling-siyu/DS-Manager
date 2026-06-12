import { useState } from 'react';
import { data } from './data';
import ProjectComponent from './components/ProjectComponent';
import { synthesizeProps } from './lib/placeholders';
import type { PreviewComponent } from './types';

// The screenshot stage: #/stage/<name>?scenario=<i>  (a legacy
// #/stage/<source>/<name> form is still accepted — the source segment is
// ignored). Renders exactly ONE component scenario with no chrome, isolated in
// the same iframe used everywhere (so screenshots match the live preview), kills
// all motion, and sets data-stage-ready="true" once mounted — the edit loop's
// puppeteer waits on that attribute (or .render-error).

const STAGE_CSS = `
  html { scroll-behavior: auto !important; }
  body { margin: 0; background: #f6f7f9; }
  .stage {
    width: 800px;
    box-sizing: border-box;
    padding: 48px;
    min-height: 200px;
    overflow: hidden;
    background: #f6f7f9;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .render-error { color: #dc2626; font-size: 13px; font-family: ui-monospace, monospace; }
`;

interface StageTarget {
  component: PreviewComponent;
  props: Record<string, unknown>;
  iconWeight?: string;
}

function parseStage(): StageTarget | { error: string } {
  const raw = window.location.hash.replace(/^#\/stage\//, '');
  const [pathPart, query = ''] = raw.split('?');
  const segments = pathPart.split('/');
  // Last segment is the component name; an optional leading source segment
  // (legacy `dsm`/`securamark`) is ignored.
  const name = decodeURIComponent(segments[segments.length - 1] ?? '');
  const params = new URLSearchParams(query);

  const component = data.components.find((c) => c.name === name);
  if (!component) {
    return { error: `Unknown component "${name}"` };
  }

  const scenarios = component.previewScenarios.length
    ? component.previewScenarios
    : [{ name: 'Default', props: {} }];
  const idx = Number.parseInt(params.get('scenario') ?? '0', 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= scenarios.length) {
    return { error: `Scenario index ${params.get('scenario')} out of range (0–${scenarios.length - 1}) for ${name}` };
  }

  const handlers = Object.fromEntries((component.handlers ?? []).map((h) => [h, () => {}]));
  return {
    component,
    props: {
      ...synthesizeProps(component),
      ...handlers,
      ...component.previewProps,
      ...scenarios[idx].props,
    },
    iconWeight: data.icons?.style?.weight ?? 'light',
  };
}

export default function StagePage() {
  const [target] = useState(parseStage);
  const [ready, setReady] = useState(false);
  const isError = 'error' in target;

  return (
    <>
      <style>{STAGE_CSS}</style>
      <div className="stage" data-stage-ready={ready ? 'true' : undefined}>
        {isError ? (
          <div className="render-error">{target.error}</div>
        ) : (
          <ProjectComponent
            absPath={target.component.absPath}
            props={target.props}
            iconWeight={target.iconWeight}
            theme={data.defaultTheme}
            freezeMotion
            eager
            onReady={() => {
              // Wait for fonts before declaring the stage ready, so text metrics
              // are stable in the screenshot.
              document.fonts.ready.then(() => setReady(true));
            }}
          />
        )}
      </div>
    </>
  );
}
