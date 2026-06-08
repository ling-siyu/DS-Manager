import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreviewData } from '../src/utils/preview-data.js';
import { resolveProjectPaths } from '../src/utils/paths.js';

// Runs against the real repo sources (tokens.json, components.json, and the
// committed SecuraMark capture). The data layer is pure, so this is a fast
// headless check of the shapes the Vite preview consumes.

const data = buildPreviewData(resolveProjectPaths());

test('SecuraMark token set carries dark/light colors and fontSize line-heights', () => {
  const { securamark } = data.tokenSets;
  assert.ok(securamark.length > 50, 'SecuraMark token set should be populated');

  const background = securamark.find((t) => t.path === 'color.background');
  assert.ok(background, 'color.background present');
  assert.equal(background.value, '#0e0e0e');
  assert.equal(background.themeLight, '#f5f5f5', 'light variant carried from $extensions');

  const base = securamark.find((t) => t.path === 'fontSize.base');
  assert.ok(base, 'fontSize.base present');
  assert.equal(base.lineHeight, '1.5rem', 'paired lineHeight carried from $extensions');
});

test('DSM token set resolves values and carries cssVar names', () => {
  const { dsm } = data.tokenSets;
  assert.ok(dsm.length > 0, 'DSM token set should be populated');
  assert.ok(dsm.every((t) => typeof t.group === 'string' && t.group.length), 'every item is grouped');
  assert.ok(dsm.some((t) => typeof t.cssVar === 'string' && t.cssVar.startsWith('--ds-')), 'cssVar present');
});

test('components exclude junk entries and carry preview metadata', () => {
  const list = data.components;
  assert.ok(Array.isArray(list) && list.length > 0, 'components is a non-empty array');
  // Junk registry rows (path pointing at index.html) are filtered out.
  assert.ok(list.every((c) => /\.(tsx|jsx|ts|js)$/.test(c.path)), 'every component path is a source file');
  assert.ok(!list.some((c) => c.path.endsWith('.html')), 'no .html junk entries');

  const button = list.find((c) => c.name === 'Button');
  assert.ok(button, 'Button present');
  assert.ok(Array.isArray(button.previewScenarios), 'previewScenarios is an array');
  assert.ok(button.previewProps && typeof button.previewProps === 'object', 'previewProps present');
});
