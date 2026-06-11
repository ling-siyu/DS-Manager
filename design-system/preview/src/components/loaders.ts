import type { ComponentType } from 'react';

export type LoadedComponent = ComponentType<Record<string, unknown>>;

// DSM's own components are resolved statically via glob (outside the preview
// root; ui.js allows fs access).
export const DSM_LOADERS = import.meta.glob('../../../src/components/ui/*.tsx') as Record<
  string,
  () => Promise<{ default: LoadedComponent }>
>;

export function dsmLoaderFor(path: string) {
  const base = path.split('/').pop();
  const key = Object.keys(DSM_LOADERS).find((k) => k.endsWith(`/${base}`));
  return key ? DSM_LOADERS[key] : null;
}

/**
 * Load a SecuraMark component cross-repo via Vite dev's /@fs (the absolute path
 * is fs-allowed in ui.js). Backslashes and the leading slash are normalized so
 * the URL form works for POSIX and Windows paths alike.
 */
export function loadFromFs(absPath: string): Promise<{ default: LoadedComponent }> {
  const normalized = absPath.replace(/\\/g, '/').replace(/^\//, '');
  return import(/* @vite-ignore */ `/@fs/${normalized}`);
}
