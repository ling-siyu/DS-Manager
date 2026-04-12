import React from 'react';

export default class PreviewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="preview-card preview-card-danger">
          <p className="preview-eyebrow">Render error</p>
          <h2 className="preview-title">Component crashed inside the preview canvas</h2>
          <p className="preview-copy">{this.state.error.message || 'Unknown React render error.'}</p>
        </section>
      );
    }

    return this.props.children;
  }
}
