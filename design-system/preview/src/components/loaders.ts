import type { ComponentType } from 'react';

export type LoadedComponent = ComponentType<Record<string, unknown>>;

/**
 * Load a project component cross-file via Vite dev's /@fs (the absolute path is
 * fs-allowed in ui.js). Backslashes and the leading slash are normalized so the
 * URL form works for POSIX and Windows paths alike.
 */
export function loadFromFs(absPath: string): Promise<{ default: LoadedComponent }> {
  const normalized = absPath.replace(/\\/g, '/').replace(/^\//, '');
  return import(/* @vite-ignore */ `/@fs/${normalized}`);
}
