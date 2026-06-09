import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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
// SecuraMark's compiled Tailwind utilities + @theme (no preflight) so its real
// components render styled. Inert for the chrome (which uses custom class names).
injectStyle('data-securamark-css', data.securamark?.css || '');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
