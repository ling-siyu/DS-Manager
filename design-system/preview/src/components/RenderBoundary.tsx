import React from 'react';

// Catches synchronous render errors from a previewed component and shows the
// message instead of crashing the page. Resets when `resetKey` changes (e.g. a
// new scenario or component).
export default class RenderBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { error: string }
> {
  state = { error: '' };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: '' });
  }
  render() {
    return this.state.error ? (
      <div className="render-error">Render error: {this.state.error}</div>
    ) : (
      this.props.children
    );
  }
}
