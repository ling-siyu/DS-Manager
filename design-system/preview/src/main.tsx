import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import StagePage from './StagePage';
import { data } from './data';

// Self-hosted fonts (bundled by Vite, no CDN) — mirrors SecuraMark's @fontsource
// setup so type specimens render faithfully AND work offline / in Mainland China
// where Google Fonts is blocked. Roles: Aleo=brand, Inter=Latin, M PLUS Code
// Latin=mono, Noto Sans SC=CJK (Simplified Chinese subset).
import '@fontsource/aleo/latin-500.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/m-plus-code-latin/latin-400.css';
import '@fontsource/m-plus-code-latin/latin-500.css';
import '@fontsource/noto-sans-sc/chinese-simplified-400.css';
import '@fontsource/noto-sans-sc/chinese-simplified-500.css';
import '@fontsource/noto-sans-sc/chinese-simplified-700.css';

import './styles.css';

// Inject the design system's CSS custom properties so token-driven components
// (which reference var(--ds-…)) resolve at runtime.
// Inject (or replace, on HMR) a <style> in <head>.
function injectStyle(attr: string, css: string) {
  if (!css) return;
  document.head.querySelector(`style[${attr}]`)?.remove();
  const el = document.createElement('style');
  el.setAttribute(attr, '');
  el.textContent = css;
  document.head.appendChild(el);
}

injectStyle('data-dsm-tokens', data.cssVars || '');
// NOTE: data.projectCss is deliberately NOT injected here. It is the project's
// REAL stylesheet (Tailwind preflight + @layer base resets + theme) and would
// clobber the DSM chrome. It is injected per-component inside the render iframe
// (ProjectComponent.tsx), where it applies with full fidelity in isolation.

// Adopt the PROJECT's identity in the chrome (scoped to the theme attribute on
// .app/.canvas-world, and ordered after styles.css so it overrides the defaults):
//   --project-bg  → a component frame's card matches the surface it renders on
//   --p-accent / --p-accent-text → retint nav selection, focus, outlines from
//   DSM's default brand to the project's primary. Only these few values are
//   surfaced — never the project's full stylesheet (that stays iframe-isolated).
const t = data.projectTheme;
if (t) {
  // Map the chrome's --p-* surfaces to the project's neutrals + accent. --project-bg
  // (component card / inspector stage) is the true app background; the canvas
  // backdrop and panels use it too / the elevated surface.
  const decl = (mode: 'dark' | 'light') => [
    t.background?.[mode] && `--project-bg:${t.background[mode]}`,
    t.background?.[mode] && `--p-bg:${t.background[mode]}`,
    t.surface?.[mode] && `--p-panel:${t.surface[mode]}`,
    t.surface?.[mode] && `--p-canvas:${t.surface[mode]}`,
    t.surfaceMuted?.[mode] && `--p-chip:${t.surfaceMuted[mode]}`,
    t.text?.[mode] && `--p-text:${t.text[mode]}`,
    t.textMuted?.[mode] && `--p-muted:${t.textMuted[mode]}`,
    t.border?.[mode] && `--p-border:${t.border[mode]}`,
    t.primary?.[mode] && `--p-accent:${t.primary[mode]}`,
    t.onPrimary?.[mode] && `--p-accent-text:${t.onPrimary[mode]}`,
  ].filter(Boolean).join(';');
  const dark = decl('dark');
  const light = decl('light');
  injectStyle(
    'data-project-theme',
    `${dark ? `[data-theme="dark"]{${dark}}` : ''}${light ? `[data-theme="light"]{${light}}` : ''}`,
  );
}

// The screenshot stage bypasses the App chrome entirely (and StrictMode's
// double-invocation, which would double dynamic imports for no benefit there).
const isStage = window.location.hash.startsWith('#/stage/');

createRoot(document.getElementById('root')!).render(
  isStage ? (
    <StagePage />
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
);
