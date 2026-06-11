import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { normalizeHex, buildValueIndex } from '../src/utils/tokens.js';
import { applyHexFixes } from '../src/utils/scan-fix.js';
import { typecheckFiles } from '../src/utils/typecheck.js';
import { diffPair } from '../src/utils/shot-diff.js';
import { PNG } from 'pngjs';

// ── normalizeHex / buildValueIndex ───────────────────────────────────────────

test('normalizeHex lowercases, expands shorthand, and rejects alpha forms', () => {
  assert.equal(normalizeHex('#ABCDEF'), '#abcdef');
  assert.equal(normalizeHex('#abc'), '#aabbcc');
  assert.equal(normalizeHex('#abcd'), null);      // 4-digit = alpha
  assert.equal(normalizeHex('#aabbccdd'), null);  // 8-digit = alpha
  assert.equal(normalizeHex('not-a-hex'), null);
});

test('buildValueIndex groups by normalized value with semantic candidates first', () => {
  const index = buildValueIndex({
    'primitive.color.gray.50': { cssVar: '--ds-primitive-color-gray-50', resolvedValue: '#FAFAFA' },
    'semantic.color.background.subtle': { cssVar: '--ds-semantic-color-background-subtle', resolvedValue: '#fafafa' },
    'semantic.color.text.default': { cssVar: '--ds-semantic-color-text-default', resolvedValue: '#171717' },
  });
  const fafafa = index.get('#fafafa');
  assert.equal(fafafa.length, 2);
  assert.equal(fafafa[0].path, 'semantic.color.background.subtle', 'semantic ranked first');
  assert.equal(index.get('#171717').length, 1);
});

// ── applyHexFixes against a fixture token set ────────────────────────────────

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dsm-fix-'));
  // Token set: one unique hex, one value shared by two semantic tokens (ambiguous)
  writeFileSync(join(dir, 'tokens.json'), JSON.stringify({
    semantic: {
      color: {
        brand:  { $value: '#123456', $type: 'color' },
        paper:  { $value: '#ffffff', $type: 'color' },
        inverse:{ $value: '#ffffff', $type: 'color' },
      },
    },
  }));
  return dir;
}

test('applyHexFixes replaces unique values, skips ambiguous/alpha, and respects CSS value position', () => {
  const dir = makeFixture();
  try {
    const tsx = join(dir, 'Comp.tsx');
    writeFileSync(tsx, [
      'const a = { color: "#123456" };',   // quoted → excluded by the scan lookbehind (not a violation)
      'const b = { color: #123456 };',      // not real TS, but exercises the raw matcher
      'const c = { bg: #ffffff };',         // ambiguous → skipped with candidates
      'const d = { line: #12345678 };',     // alpha → skipped
    ].join('\n'));

    const css = join(dir, 'styles.css');
    writeFileSync(css, [
      '#123456 { padding: 0; }',            // id-selector position → must NOT be touched
      '.x { color: #123456; }',             // value position → fixed
    ].join('\n'));

    const { fixed, skipped } = applyHexFixes([tsx, css], { tokensPath: join(dir, 'tokens.json'), cwd: dir });

    const fixedFiles = fixed.map((f) => `${f.file}:${f.line}`).sort();
    assert.deepEqual(fixedFiles, ['Comp.tsx:2', 'styles.css:2']);
    assert.ok(fixed.every((f) => f.token === 'semantic.color.brand'));

    const ambiguous = skipped.find((s) => s.reason === 'ambiguous');
    assert.ok(ambiguous, 'ambiguous #ffffff reported');
    assert.deepEqual(ambiguous.candidates.sort(), ['semantic.color.inverse', 'semantic.color.paper']);
    assert.ok(skipped.some((s) => s.reason === 'alpha-hex'));
    assert.ok(skipped.some((s) => s.reason === 'not-a-css-value'), 'id selector skipped');

    const updatedCss = readFileSync(css, 'utf8');
    assert.match(updatedCss, /^#123456 \{ padding: 0; \}/, 'selector untouched');
    assert.match(updatedCss, /color: var\(--ds-semantic-color-brand\);/, 'value fixed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── typecheck ────────────────────────────────────────────────────────────────

test('typecheckFiles reports a deliberate type error and passes a clean file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsm-tc-'));
  try {
    const bad = join(dir, 'bad.ts');
    writeFileSync(bad, 'const n: number = "definitely not a number";\n');
    const good = join(dir, 'good.ts');
    writeFileSync(good, 'export const ok: number = 42;\n');

    const badDiags = typecheckFiles([bad]);
    assert.ok(badDiags.some((d) => d.category === 'error' && d.code === 2322), 'TS2322 reported');

    assert.deepEqual(typecheckFiles([good]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── pixel diff ───────────────────────────────────────────────────────────────

function solidPng(width, height, [r, g, b]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return png;
}

test('diffPair reports 0% for identical shots, >0% for changed, and survives dimension changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsm-diff-'));
  try {
    const red = join(dir, 'red.png');
    const red2 = join(dir, 'red2.png');
    const blue = join(dir, 'blue.png');
    const tall = join(dir, 'tall.png');
    writeFileSync(red, PNG.sync.write(solidPng(20, 20, [255, 0, 0])));
    writeFileSync(red2, PNG.sync.write(solidPng(20, 20, [255, 0, 0])));
    writeFileSync(blue, PNG.sync.write(solidPng(20, 20, [0, 0, 255])));
    writeFileSync(tall, PNG.sync.write(solidPng(20, 30, [255, 0, 0])));

    const same = diffPair(red, red2, join(dir, 'd1.png'));
    assert.equal(same.changedPixels, 0);
    assert.equal(same.dimensionsChanged, false);

    const changed = diffPair(red, blue, join(dir, 'd2.png'));
    assert.equal(changed.changedPct, 100);

    const grown = diffPair(red, tall, join(dir, 'd3.png'));
    assert.equal(grown.dimensionsChanged, true);
    assert.ok(grown.changedPixels > 0, 'padded region counts as changed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
