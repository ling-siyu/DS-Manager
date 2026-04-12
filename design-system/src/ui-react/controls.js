export function getScenarioOptions(component) {
  const scenarios = Array.isArray(component?.preview?.previewScenarios)
    ? component.preview.previewScenarios
    : [];

  return [
    {
      id: '__default__',
      label: 'Default props',
      props: {},
    },
    ...scenarios.map((scenario, index) => ({
      id: `scenario-${index}`,
      label: scenario.name,
      props: scenario.props || {},
    })),
  ];
}

export function getMergedProps(component, scenarioId) {
  const baseProps = component?.preview?.previewProps || {};
  const adapterDefaults = component?.preview?.adapterDefaults || {};
  const scenarios = getScenarioOptions(component);
  const selected = scenarios.find((scenario) => scenario.id === scenarioId) || scenarios[0];

  return {
    props: {
      ...baseProps,
      ...adapterDefaults,
      ...(selected?.props || {}),
    },
    selected,
    scenarios,
  };
}

export function formatDiagnostics(summary, component) {
  return [
    ...(summary?.warnings || []),
    ...(summary?.errors || []),
    ...(component?.preview?.errors || []),
  ];
}
