import {
  isBorderWidthToken,
  isColorToken,
  isIconToken,
  isMotionToken,
  isRadiusToken,
  isShadowToken,
  isSpacingToken,
  isTypographyToken,
} from './utils.js';

function enrichComponents(items) {
  const byName = new Map(items.map((component) => [component.name, component]));
  const cache = new Map();
  const visiting = new Set();

  function visit(component) {
    if (cache.has(component.name)) return cache.get(component.name);

    const contains = Array.isArray(component.contains)
      ? component.contains.map((name) => String(name || '').trim()).filter(Boolean)
      : [];

    if (visiting.has(component.name)) {
      const fallback = {
        ...component,
        contains,
        level: 1,
        levelLabel: 'Lv.1',
        hasCycle: true,
      };

      cache.set(component.name, fallback);
      return fallback;
    }

    visiting.add(component.name);
    const childLevels = contains
      .map((name) => byName.get(name))
      .filter(Boolean)
      .map((entry) => visit(entry).level);
    visiting.delete(component.name);

    const hasCycle = contains
      .map((name) => byName.get(name))
      .filter(Boolean)
      .map((entry) => visit(entry))
      .some((entry) => entry.hasCycle);
    const level = childLevels.length
      ? (hasCycle ? 1 : Math.max(...childLevels) + 1)
      : Number(component.level) || 1;

    const enriched = {
      ...component,
      contains,
      level,
      levelLabel: `Lv.${level}`,
      hasCycle,
    };

    cache.set(component.name, enriched);
    return enriched;
  }

  return items
    .map((component) => visit(component))
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
}

export function createAppState(data) {
  const tokenEntries = Object.entries(data.tokens || {});
  const components = enrichComponents(data.components || []);
  const usedIcons = data.usedIcons || [];
  const health = data.health || {
    summary: { fatal: 0, warning: 0, info: 0 },
    diagnosticsByName: {},
  };
  const preview = data.preview || {
    framework: null,
    mode: 'metadata-only',
    status: 'disabled',
    reason: 'Metadata preview only.',
    modeLabel: 'Metadata only',
    availableComponents: [],
    errors: [],
    warnings: [],
  };

  const tokenGroupModels = [
    {
      id: 'colors',
      title: 'Color Tokens',
      description: 'Primitive and semantic color values for backgrounds, borders, text, and status.',
      entries: tokenEntries.filter(isColorToken),
    },
    {
      id: 'spacing',
      title: 'Spacing Tokens',
      description: 'Spacing, sizing, and dimension values that shape layout rhythm.',
      entries: tokenEntries.filter((entry) => isSpacingToken(entry) && !isColorToken(entry) && !isIconToken(entry)),
    },
    {
      id: 'border-width',
      title: 'Border Width Tokens',
      description: 'Primitive and semantic border width values for strokes, dividers, and focus rings.',
      entries: tokenEntries.filter(isBorderWidthToken),
    },
    {
      id: 'radius',
      title: 'Border Radius Tokens',
      description: 'Corner radius values from sharp to pill, including semantic intent aliases.',
      entries: tokenEntries.filter(isRadiusToken),
    },
    {
      id: 'typography',
      title: 'Typography Tokens',
      description: 'Font size, weight, and typography-related decisions for readable UI.',
      entries: tokenEntries.filter(isTypographyToken),
    },
    {
      id: 'icons',
      title: 'Icon Tokens',
      description: 'Size scale, stroke weights, and composite style presets for Lucide and Material Symbols.',
      entries: tokenEntries.filter(isIconToken),
      usedIcons,
    },
    {
      id: 'motion',
      title: 'Motion Tokens',
      description: 'Duration, easing curves, and transition presets for animation and interaction.',
      entries: tokenEntries.filter(isMotionToken),
    },
    {
      id: 'shadows',
      title: 'Shadow Tokens',
      description: 'Elevation and depth tokens used across cards, overlays, and surfaces.',
      entries: tokenEntries.filter(isShadowToken),
    },
  ];

  function getLevelModels() {
    const highestLevel = components.reduce((max, component) => Math.max(max, component.level || 1), 1);
    const models = [
      {
        id: 'lv0',
        numericLevel: 0,
        label: 'Lv.0',
        title: 'Token Foundation',
        description: 'Primitive, semantic, and component tokens that anchor the system.',
        count: tokenEntries.length,
        itemLabel: 'tokens',
      },
    ];

    for (let level = 1; level <= highestLevel; level += 1) {
      const count = components.filter((component) => component.level === level).length;
      if (!count) continue;

      models.push({
        id: `lv${level}`,
        numericLevel: level,
        label: `Lv.${level}`,
        title: level === 1 ? 'Essential Components' : 'Composed Components',
        description: level === 1
          ? 'Leaf building blocks that do not depend on other registered components.'
          : `Assets composed from lower-level components. Lv.${level} depends on Lv.${level - 1} or lower.`,
        count,
        itemLabel: 'components',
      });
    }

    return models;
  }

  return {
    tokenEntries,
    components,
    health,
    preview,
    tokenGroupModels,
    getLevelModels,
    getLevel(levelId) {
      return getLevelModels().find((level) => level.id === levelId) || getLevelModels()[0];
    },
    getTokenGroup(groupId) {
      return tokenGroupModels.find((group) => group.id === groupId) || tokenGroupModels[0];
    },
    getComponentByName(name) {
      return components.find((component) => component.name === name) || null;
    },
    getTokenByPath(path) {
      return tokenEntries.find(([tokenPath]) => tokenPath === path) || null;
    },
    getHealthBannerLines() {
      const sourceBackedCount = components.filter((component) => component.preview?.sourceExists).length;
      const missingPathCount = components.filter((component) => !component.preview?.sourceExists).length;
      const lines = [];

      lines.push(`Registry contains ${sourceBackedCount} source-backed component${sourceBackedCount === 1 ? '' : 's'}.`);
      if (missingPathCount > 0) {
        lines.push(`${missingPathCount} registry path${missingPathCount === 1 ? ' is' : 's are'} missing.`);
      }
      if (preview.mode !== 'live-render') {
        lines.push(`Preview is running in ${preview.modeLabel?.toLowerCase() || 'metadata-only'} mode.`);
      }
      if ((health.summary?.fatal || 0) > 0 || (health.summary?.warning || 0) > 0) {
        lines.push('Run `dsm doctor` to inspect configuration issues.');
      }

      return lines;
    },
  };
}

export function parseRoute(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '');
  if (!raw || raw === 'home') return { name: 'home' };

  const parts = raw.split('/').map((part) => decodeURIComponent(part));
  if (parts[0] === 'level' && parts[1]) return { name: 'level', levelId: parts[1] };
  if (parts[0] === 'token-group' && parts[1]) return { name: 'token-group', groupId: parts[1] };
  if (parts[0] === 'token' && parts[1] && parts[2]) return { name: 'token', groupId: parts[1], tokenPath: parts.slice(2).join('/') };
  if (parts[0] === 'component' && parts[1] && parts[2]) return { name: 'component', levelId: parts[1], componentName: parts.slice(2).join('/') };
  return { name: 'home' };
}

export function toHash(route) {
  if (route.name === 'home') return '#home';
  if (route.name === 'level') return `#level/${encodeURIComponent(route.levelId)}`;
  if (route.name === 'token-group') return `#token-group/${encodeURIComponent(route.groupId)}`;
  if (route.name === 'token') return `#token/${encodeURIComponent(route.groupId)}/${encodeURIComponent(route.tokenPath)}`;
  if (route.name === 'component') return `#component/${encodeURIComponent(route.levelId)}/${encodeURIComponent(route.componentName)}`;
  return '#home';
}
