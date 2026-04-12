import { existsSync, readFileSync } from 'fs';

function normalizeContains(contains) {
  if (!Array.isArray(contains)) return [];
  return contains
    .map((name) => String(name || '').trim())
    .filter(Boolean);
}

export function loadComponentRegistry(componentsPath) {
  if (!existsSync(componentsPath)) return null;
  return JSON.parse(readFileSync(componentsPath, 'utf8'));
}

export function enrichComponents(components = []) {
  const byName = new Map(components.map((component) => [component.name, component]));
  const cache = new Map();
  const visiting = new Set();

  function visit(componentName) {
    if (cache.has(componentName)) {
      return cache.get(componentName);
    }

    const component = byName.get(componentName);
    if (!component) return null;

    const contains = normalizeContains(component.contains);
    const missingDependencies = contains.filter((name) => !byName.has(name));

    if (visiting.has(componentName)) {
      const fallback = {
        ...component,
        contains,
        missingDependencies,
        level: 1,
        levelLabel: 'Lv.1',
        hasCycle: true,
      };
      cache.set(componentName, fallback);
      return fallback;
    }

    visiting.add(componentName);
    const containedComponents = contains
      .map((name) => visit(name))
      .filter(Boolean);
    visiting.delete(componentName);

    const hasCycle = containedComponents.some((entry) => entry.hasCycle);
    const baseLevel = containedComponents.length
      ? (hasCycle ? 1 : Math.max(...containedComponents.map((entry) => entry.level)) + 1)
      : 1;

    const enriched = {
      ...component,
      contains,
      missingDependencies,
      level: baseLevel,
      levelLabel: `Lv.${baseLevel}`,
      hasCycle,
    };

    cache.set(componentName, enriched);
    return enriched;
  }

  return components
    .map((component) => visit(component.name))
    .filter(Boolean)
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
}
