import type { PreviewComponent } from '../types';
import RenderBoundary from './RenderBoundary';
import ProjectComponent from './ProjectComponent';
import { synthesizeProps } from '../lib/placeholders';

const NOOP = () => {};

/** No-op handlers for a component's declared callback props, so controlled
 *  inputs render without React's "value without onChange" warning. */
function handlerProps(component: PreviewComponent): Record<string, unknown> {
  return Object.fromEntries((component.handlers ?? []).map((h) => [h, NOOP]));
}

/** Render one component scenario live, isolated in an iframe (Storybook-grade
 *  fidelity) and loaded cross-file via Vite's /@fs. */
export default function LiveRender({
  component,
  iconWeight,
  theme,
  scenarioProps,
  resetKey,
}: {
  component: PreviewComponent;
  iconWeight?: string;
  theme?: string;
  scenarioProps: Record<string, unknown>;
  resetKey: string;
}) {
  const props = {
    ...synthesizeProps(component),
    ...handlerProps(component),
    ...component.previewProps,
    ...scenarioProps,
  };
  return (
    <RenderBoundary resetKey={resetKey}>
      <ProjectComponent absPath={component.absPath} props={props} iconWeight={iconWeight} theme={theme} />
    </RenderBoundary>
  );
}
