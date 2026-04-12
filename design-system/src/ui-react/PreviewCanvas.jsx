import React from 'react';

export default function PreviewCanvas({ children, status, message }) {
  return (
    <section className="preview-card preview-canvas-card">
      <div className="preview-card-head">
        <div>
          <p className="preview-eyebrow">Canvas</p>
          <h2 className="preview-title">Live component output</h2>
        </div>
        <span className="preview-badge">{status}</span>
      </div>

      {message ? <p className="preview-copy">{message}</p> : null}

      <div className="preview-canvas">
        {children}
      </div>
    </section>
  );
}
