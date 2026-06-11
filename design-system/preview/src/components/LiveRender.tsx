import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { PreviewComponent, SecuraMarkComponent as SMComponent } from '../types';
import RenderBoundary from './RenderBoundary';
import SecuraMarkComponent from './SecuraMarkComponent';
import { dsmLoaderFor as loaderFor } from './loaders';

export type Source = 'dsm' | 'securamark';

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

/** Render one component scenario live, source-aware (DSM glob / SecuraMark /@fs). */
export default function LiveRender({
  component,
  source,
  iconWeight,
  scenarioProps,
  resetKey,
}: {
  component: PreviewComponent | SMComponent;
  source: Source;
  iconWeight?: string;
  scenarioProps: Record<string, unknown>;
  resetKey: string;
}) {
  const props = {
    ...(source === 'securamark' ? handlerProps(component) : {}),
    ...component.previewProps,
    ...scenarioProps,
  };
  return (
    <RenderBoundary resetKey={resetKey}>
      {source === 'securamark' ? (
        <SecuraMarkComponent absPath={(component as SMComponent).absPath} props={props} iconWeight={iconWeight} />
      ) : (
        <DsmLive path={component.path} props={props} />
      )}
    </RenderBoundary>
  );
}
