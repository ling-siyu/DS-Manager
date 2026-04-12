import React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewApp from './PreviewApp.jsx';

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(PreviewApp, {
  adapter: window.__DSM_PREVIEW_ADAPTER__,
  boot: window.__DSM_PREVIEW_DATA__ || {},
}));
