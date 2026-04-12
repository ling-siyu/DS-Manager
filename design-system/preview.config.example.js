export default {
  framework: 'react',
  components: {
    Button: () => import('../src/components/ui/Button.jsx'),
    Card: () => import('../src/components/ui/Card.jsx'),
  },
  defaults: {
    Button: { children: 'Button' },
    Card: { children: 'Card content' },
  },
  renderProviders({ children }) {
    return children;
  },
};
