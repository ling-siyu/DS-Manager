import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { resolveReference, flattenTokens } from '../src/utils/tokens.js';
import {
  convertTokens,
  reconstructTailwindTheme,
  deepDiff,
} from '../src/commands/import-tokens.js';
import { loadTsModule } from '../src/utils/ts-tokens.js';

// ── resolveReference: transitive resolution + guards ────────────────────────

test('resolveReference follows a multi-level alias chain to the final value', () => {
  const flat = flattenTokens({
    semantic: { text: { $value: '{brand.fg}', $type: 'color' } },
    brand: { fg: { $value: '{palette.ink}', $type: 'color' } },
    palette: { ink: { $value: '#171717', $type: 'color' } },
  });
  assert.equal(resolveReference('{semantic.text}', flat), '#171717');
});

test('resolveReference still resolves a single level (no regression)', () => {
  const flat = flattenTokens({
    semantic: { bg: { $value: '{palette.white}', $type: 'color' } },
    palette: { white: { $value: '#ffffff', $type: 'color' } },
  });
  assert.equal(resolveReference('{semantic.bg}', flat), '#ffffff');
});

test('resolveReference returns the original ref when the path is unknown', () => {
  const flat = flattenTokens({ palette: { x: { $value: '#000', $type: 'color' } } });
  assert.equal(resolveReference('{does.not.exist}', flat), '{does.not.exist}');
});

test('resolveReference does not infinite-loop on a reference cycle', () => {
  const flat = flattenTokens({
    a: { $value: '{b}', $type: 'color' },
    b: { $value: '{a}', $type: 'color' },
  });
  // Should terminate and return a still-aliased value, not hang or throw.
  const result = resolveReference('{a}', flat);
  assert.ok(typeof result === 'string' && result.startsWith('{'));
});

// ── convertTokens: TS exports → DTCG ────────────────────────────────────────

const SAMPLE = {
  colors: { background: '#0e0e0e', primary: '#8BBFAC' },
  colorsLight: { background: '#f5f5f5', primary: '#8BBFAC' },
  fontFamily: { sans: ['"Inter"', 'sans-serif'] },
  fontWeight: { bold: '700' },
  letterSpacing: { tight: '-0.025em' },
  fontSize: {
    base: ['1rem', { lineHeight: '1.5rem' }],
    hero: ['clamp(1.5rem,3vw,2.25rem)', { lineHeight: '1.15' }],
  },
  animationDuration: { swift: '150ms' },
  animationEasing: { standard: 'cubic-bezier(0.2, 0, 0, 1)' },
  borderRadius: { lg: '0px' },
  boxShadow: { md: 'none' },
  aspectRatio: { card: '4 / 5' },
  iconSize: { md: 16 },
  semanticTypography: {
    body: { fontFamily: 'sans', fontSize: 'base', fontWeight: 'bold', usage: 'Body copy' },
  },
  animationTransition: {
    feedback: { properties: ['color'], duration: 'swift', easing: 'standard' },
  },
};

test('convertTokens emits dark $value with light variant in $extensions', () => {
  const dtcg = convertTokens(SAMPLE);
  assert.equal(dtcg.color.background.$value, '#0e0e0e');
  assert.equal(dtcg.color.background.$type, 'color');
  assert.equal(dtcg.color.background.$extensions['com.securamark'].themeLight, '#f5f5f5');
  // Identical dark/light value carries no theme extension.
  assert.equal(dtcg.color.primary.$extensions, undefined);
});

test('convertTokens preserves fontSize tuples (size as $value, lineHeight in ext)', () => {
  const dtcg = convertTokens(SAMPLE);
  assert.equal(dtcg.fontSize.base.$value, '1rem');
  assert.equal(dtcg.fontSize.base.$extensions['com.securamark'].lineHeight, '1.5rem');
  assert.equal(dtcg.fontSize.hero.$value, 'clamp(1.5rem,3vw,2.25rem)');
});

test('convertTokens turns string-key references into DTCG aliases', () => {
  const dtcg = convertTokens(SAMPLE);
  assert.deepEqual(dtcg.semanticTypography.body.$value, {
    fontFamily: '{fontFamily.sans}',
    fontSize: '{fontSize.base}',
    fontWeight: '{fontWeight.bold}',
  });
  assert.equal(dtcg.semanticTypography.body.$description, 'Body copy');
  assert.equal(dtcg.animationTransition.feedback.$value.duration, '{animationDuration.swift}');
  assert.equal(dtcg.animationTransition.feedback.$value.timingFunction, '{animationEasing.standard}');
});

test('convertTokens only emits groups for exports that are present', () => {
  const dtcg = convertTokens({ colors: { x: '#000' } });
  assert.deepEqual(Object.keys(dtcg), ['color']);
});

// ── Round-trip: DTCG → Tailwind theme reconstruction ────────────────────────

test('reconstructTailwindTheme round-trips token values losslessly', () => {
  const dtcg = convertTokens(SAMPLE);
  const theme = reconstructTailwindTheme(dtcg);

  // The shape Tailwind expects, rebuilt purely from DTCG.
  const expected = {
    borderRadius: { lg: '0px' },
    boxShadow: { md: 'none' },
    fontFamily: { sans: ['"Inter"', 'sans-serif'] },
    fontWeight: { bold: '700' },
    extend: {
      aspectRatio: { card: '4 / 5' },
      letterSpacing: { tight: '-0.025em' },
      fontSize: {
        base: ['1rem', { lineHeight: '1.5rem' }],
        hero: ['clamp(1.5rem,3vw,2.25rem)', { lineHeight: '1.15' }],
      },
      transitionDuration: { swift: '150ms' },
      transitionTimingFunction: { standard: 'cubic-bezier(0.2, 0, 0, 1)' },
    },
  };
  assert.deepEqual(deepDiff(expected, theme), []);
});

test('deepDiff reports concrete mismatches with a path', () => {
  const diffs = deepDiff({ a: { b: 1 } }, { a: { b: 2 } });
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].path, 'a.b');
  assert.equal(diffs[0].expected, 1);
  assert.equal(diffs[0].actual, 2);
});

// ── loadTsModule: real esbuild transpile of an `as const satisfies` module ──

test('loadTsModule transpiles TS (as const / satisfies / type import) and returns runtime values', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsm-tsmod-test-'));
  try {
    writeFileSync(join(dir, 'types.ts'), 'export type Sizes = Readonly<Record<string, number>>;\n');
    writeFileSync(
      join(dir, 'entry.ts'),
      [
        "import type { Sizes } from './types';",
        "export const iconSize = { sm: 14, md: 16 } as const satisfies Sizes;",
        "export const fontSize = { base: ['1rem', { lineHeight: '1.5rem' }] } as const;",
      ].join('\n')
    );
    const mod = await loadTsModule(join(dir, 'entry.ts'));
    assert.deepEqual(mod.iconSize, { sm: 14, md: 16 });
    assert.deepEqual(mod.fontSize.base, ['1rem', { lineHeight: '1.5rem' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
