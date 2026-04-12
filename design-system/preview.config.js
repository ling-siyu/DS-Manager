export default {
  framework: 'react',

  // Map DSM registry names to lazy imports from the consuming React app.
  // Update these once the real component files exist in the project.
  components: {
    // Button: () => import('../src/components/ui/Button.tsx'),
    // Card: () => import('../src/components/ui/Card.tsx'),
  },

  // Optional JSON-serializable default props merged into DSM preview scenarios.
  defaults: {
    // Button: { children: 'Button' },
    // Card: { children: 'Card content' },
  },

  // Optional provider wrapper for router/theme/query client setup.
  renderProviders({ children }) {
    return children;
  },
};
