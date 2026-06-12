import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';

import { buildPreviewData } from '../src/utils/preview-data.js';
import { resolveProjectPaths } from '../src/utils/paths.js';

// Runs against the real repo sources (tokens.json, components.json). The data
// layer is pure and single-source — it exposes the current project's tokens and
// components — so this is a fast headless check of the shapes the Vite preview
// consumes.

const data = buildPreviewData(resolveProjectPaths());

test('token set resolves values and carries cssVar names', () => {
  const { tokens } = data;
  assert.ok(tokens.length > 0, 'token set should be populated');
  assert.ok(tokens.every((t) => typeof t.group === 'string' && t.group.length), 'every item is grouped');
  assert.ok(tokens.some((t) => typeof t.cssVar === 'string' && t.cssVar.startsWith('--ds-')), 'cssVar present');
});

test('components exclude junk entries and carry preview metadata + absolute paths', () => {
  const list = data.components;
  assert.ok(Array.isArray(list) && list.length > 0, 'components is a non-empty array');
  // Junk registry rows (path pointing at index.html) are filtered out.
  assert.ok(list.every((c) => /\.(tsx|jsx|ts|js)$/.test(c.path)), 'every component path is a source file');
  assert.ok(!list.some((c) => c.path.endsWith('.html')), 'no .html junk entries');

  // Every component resolves to an existing absolute source file (the renderer
  // loads it cross-file via Vite /@fs).
  for (const c of list) {
    assert.ok(c.absPath.startsWith('/') && existsSync(c.absPath), `${c.name} has an existing absolute path`);
    assert.ok(Array.isArray(c.previewScenarios), `${c.name} carries previewScenarios`);
    assert.ok(Array.isArray(c.handlers), `${c.name} carries a handlers list`);
  }

  const button = list.find((c) => c.name === 'Button');
  assert.ok(button, 'Button present');
  assert.ok(button.previewProps && typeof button.previewProps === 'object', 'previewProps present');
});

test('payload exposes the single-source shape', () => {
  assert.equal(typeof data.cssVars, 'string', 'cssVars is a string');
  assert.equal(typeof data.projectCss, 'string', 'projectCss is a string (filled by the ui command)');
  assert.ok(data.icons === null || typeof data.icons === 'object', 'icons is null or a capture object');
  assert.ok(!('tokenSets' in data), 'no legacy dual token sets');
  assert.ok(!('securamark' in data), 'no legacy securamark channel');
});
