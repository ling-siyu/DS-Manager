import { existsSync, readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';
import { resolveProjectPaths } from '../utils/paths.js';
import { discoverComponents } from '../utils/component-discovery.js';

function loadRegistry(paths) {
  if (!existsSync(paths.componentsPath)) {
    return {
      $schema: 'https://design-system-manager/schemas/components.json',
      $version: '0.1.0',
      components: [],
      conventions: {},
    };
  }

  return JSON.parse(readFileSync(paths.componentsPath, 'utf8'));
}

function toBaseComponent(discoveredComponent) {
  return {
    name: discoveredComponent.name,
    path: discoveredComponent.path,
    ...(Object.keys(discoveredComponent.props || {}).length ? { props: discoveredComponent.props } : {}),
    ...(discoveredComponent.variants?.length ? { variants: discoveredComponent.variants } : {}),
    ...(discoveredComponent.sizes?.length ? { sizes: discoveredComponent.sizes } : {}),
  };
}

function mergeComponent(existing, discovered, merge) {
  const base = toBaseComponent(discovered);
  if (!merge || !existing) {
    return existing
      ? {
          ...existing,
          ...base,
        }
      : base;
  }

  return {
    ...base,
    ...existing,
    path: base.path,
    props: Object.keys(base.props || {}).length ? base.props : existing.props,
    variants: base.variants?.length ? base.variants : existing.variants,
    sizes: base.sizes?.length ? base.sizes : existing.sizes,
  };
}

function buildSyncPlan(registry, discoveredComponents, options = {}) {
  const merge = options.merge === true;
  const existingComponents = Array.isArray(registry.components) ? registry.components : [];
  const existingByName = new Map(existingComponents.map((component) => [component.name, component]));
  const discoveredByName = new Map(discoveredComponents.map((component) => [component.name, component]));

  const missingFromRegistry = discoveredComponents.filter((component) => !existingByName.has(component.name));
  const stalePaths = existingComponents
    .filter((component) => discoveredByName.has(component.name) && discoveredByName.get(component.name).path !== component.path)
    .map((component) => ({
      name: component.name,
      registryPath: component.path,
      discoveredPath: discoveredByName.get(component.name).path,
    }));
  const registryOnly = existingComponents.filter((component) => !discoveredByName.has(component.name));
  const renamedCandidates = registryOnly.flatMap((component) => discoveredComponents
    .filter((candidate) => candidate.path === component.path)
    .map((candidate) => ({
      from: component.name,
      to: candidate.name,
      path: candidate.path,
    })));

  const mergedComponents = discoveredComponents.map((component) => mergeComponent(existingByName.get(component.name), component, merge));
  if (merge) {
    for (const orphaned of registryOnly) {
      mergedComponents.push(orphaned);
    }
  }

  mergedComponents.sort((left, right) => left.name.localeCompare(right.name));

  const changed = missingFromRegistry.length > 0 || stalePaths.length > 0 || registryOnly.length > 0;

  return {
    changed,
    missingFromRegistry,
    stalePaths,
    registryOnly,
    renamedCandidates,
    nextRegistry: {
      ...registry,
      components: mergedComponents,
    },
  };
}

function renderList(title, items, formatter) {
  if (items.length === 0) return;
  console.log(chalk.bold(title));
  items.forEach((item) => console.log(`  ${formatter(item)}`));
  console.log();
}

export async function syncComponentsCommand(options = {}) {
  const paths = resolveProjectPaths(process.cwd(), { allowMissingTokens: true });
  const registry = loadRegistry(paths);
  const discovered = discoverComponents(paths.repoRoot);
  const plan = buildSyncPlan(registry, discovered.components, options);

  if (options.json) {
    console.log(JSON.stringify({
      discovered: discovered.components,
      ...plan,
    }, null, 2));
  } else {
    console.log(chalk.cyan('\n🔄 DSM Component Sync\n'));
    console.log(chalk.dim(`  Scanned ${discovered.components.length} exported component${discovered.components.length === 1 ? '' : 's'}.\n`));

    if (!plan.changed) {
      console.log(chalk.green('  ✓ components.json matches the discovered source components.\n'));
    } else {
      renderList('Missing from registry', plan.missingFromRegistry, (component) => `${component.name} (${component.path})`);
      renderList('Stale registry paths', plan.stalePaths, (entry) => `${entry.name}: ${entry.registryPath} -> ${entry.discoveredPath}`);
      renderList('Registry-only components', plan.registryOnly, (component) => `${component.name} (${component.path || 'no path'})`);
      renderList('Renamed candidates', plan.renamedCandidates, (entry) => `${entry.from} -> ${entry.to} (${entry.path})`);
    }
  }

  if (options.write) {
    writeFileSync(paths.componentsPath, JSON.stringify(plan.nextRegistry, null, 2) + '\n', 'utf8');
    if (!options.json) {
      console.log(chalk.green(`  ✓ Updated ${paths.componentsPath}\n`));
    }
  }

  if (options.check && plan.changed) {
    process.exit(1);
  }
}
