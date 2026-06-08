import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { data } from './data';
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
