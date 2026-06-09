import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { IconContext } from '@phosphor-icons/react';

// Load a SecuraMark component cross-repo via Vite dev's /@fs (the absolute path is
// fs-allowed in ui.js). Vite transpiles its TSX + relative imports on the fly;
// react is deduped so hooks work across the boundary. Phosphor icons render at the
// product's captured weight via IconContext.
function loadFromFs(absPath: string) {
  // /@fs/<abs path with forward slashes>. Works for POSIX (/Users/…) and Windows
  // (C:\… → C:/…) once backslashes are normalized and any leading slash dropped.
  const normalized = absPath.replace(/\\/g, '/').replace(/^\//, '');
  return import(/* @vite-ignore */ `/@fs/${normalized}`);
}

export default function SecuraMarkComponent({
  absPath,
  props,
  iconWeight,
}: {
  absPath: string;
  props: Record<string, unknown>;
  iconWeight?: string;
}) {
  const [Comp, setComp] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setComp(null);
    setError('');
    loadFromFs(absPath)
      .then((mod) => alive && setComp(() => mod.default ?? null))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [absPath]);

  if (error) return <div className="render-error">{error}</div>;
  if (!Comp) return <div className="render-loading">Loading…</div>;
  return (
    <IconContext.Provider value={{ weight: (iconWeight as never) ?? 'regular' }}>
      <Comp {...props} />
    </IconContext.Provider>
  );
}
