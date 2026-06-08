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
const tokenStyle = document.createElement('style');
tokenStyle.setAttribute('data-dsm-tokens', '');
tokenStyle.textContent = data.cssVars || '';
document.head.appendChild(tokenStyle);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
