// Phase 2 success oracle for TS-parser component discovery.
//
// These tests define "done" for Phase 2. They currently FAIL for Button and
// Badge (the regex parser returns props:{} for imported/union/utility-typed
// props) and PASS for Card (local interface — the regression guard). When the
// ts-morph-based resolver lands, ALL of these must pass with no change to the
// discoverComponents() return shape.
//
// The fixtures under test/fixtures/ts-discovery/ are hermetic — no external
// @types needed — so this oracle is deterministic on any machine. A separate,
// best-effort integration test runs against the real SecuraMark repo when it is
// present locally.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

import { discoverComponents } from '../src/utils/component-discovery.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(TEST_DIR, 'fixtures/ts-discovery');
const PATTERNS = ['components/**/*.{tsx,ts}'];

function discover() {
  return discoverComponents(FIXTURE_ROOT, { patterns: PATTERNS });
}

const sortedKeys = (obj) => Object.keys(obj).sort();
const sorted = (arr) => [...arr].sort();

// ── Card — regression: local interface must keep working ────────────────────

test('Card: local same-file interface props are extracted', () => {
  const card = discover().byName.get('Card');
  assert.ok(card, 'Card should be discovered');
  assert.ok('title' in card.props, 'Card.props should include title');
  assert.equal(card.props.title.required, true, 'title is required');
  assert.ok('padded' in card.props, 'Card.props should include padded');
  assert.notEqual(card.props.padded.required, true, 'padded is optional');
});

// ── Badge — imported interface + (typeof CONST)[number] variant enum ─────────

test('Badge: imported interface prop type is resolved across files', () => {
  const badge = discover().byName.get('Badge');
  assert.ok(badge, 'Badge should be discovered');
  assert.ok('label' in badge.props, 'Badge.props should include label (imported type)');
  assert.equal(badge.props.label.required, true, 'label is required');
  assert.ok('variant' in badge.props, 'Badge.props should include variant');
});

test('Badge: variant enum expands from (typeof BADGE_VARIANTS)[number]', () => {
  const badge = discover().byName.get('Badge');
  assert.deepEqual(
    sorted(badge.variants),
    ['done', 'encrypted', 'error', 'pending', 'warning'],
  );
});

// ── Button — the full case: cross-file import + union + intersection + Omit<> +
//    (typeof CONST)[number] for both variant and size ─────────────────────────

test('Button: imported discriminated-union prop type resolves to non-empty props', () => {
  const button = discover().byName.get('Button');
  assert.ok(button, 'Button should be discovered');
  assert.ok(Object.keys(button.props).length > 0, 'Button.props must not be empty');
});

test('Button: declared props across all union members are captured', () => {
  const button = discover().byName.get('Button');
  for (const key of ['variant', 'size', 'iconPosition', 'className', 'icon', 'iconOnly', 'children']) {
    assert.ok(key in button.props, `Button.props should include "${key}" (saw: ${sortedKeys(button.props)})`);
  }
});

test('Button: Omit<ButtonHTMLAttributes, "children"> inherited members are resolved', () => {
  const button = discover().byName.get('Button');
  // Inherited from the DOM-attrs stand-in, minus the Omit'd "children"...
  for (const key of ['disabled', 'type']) {
    assert.ok(key in button.props, `Button.props should include inherited "${key}"`);
  }
  // ...but "children" is re-added by the union members, so it must be present.
  assert.ok('children' in button.props, 'Button.props should include children (re-added by union members)');
});

test('Button: variant + size enums expand from (typeof CONST)[number]', () => {
  const button = discover().byName.get('Button');
  assert.deepEqual(
    sorted(button.variants),
    ['danger', 'ghost', 'outline', 'primary', 'success', 'wechat'],
  );
  assert.deepEqual(sorted(button.sizes), ['lg', 'md', 'sm']);
});

test('Button: optional props are not marked required', () => {
  const button = discover().byName.get('Button');
  assert.notEqual(button.props.variant.required, true, 'variant is optional');
});

test('Button: own (authored) props are segmented from inherited DOM attributes', () => {
  const button = discover().byName.get('Button');
  const own = Object.keys(button.props).filter((k) => !button.props[k].inherited).sort();
  // Exactly the props authored on the component's own type — not the DOM surface.
  assert.deepEqual(own, ['children', 'className', 'icon', 'iconOnly', 'iconPosition', 'size', 'variant']);
  // The DOM-attrs base (from the simulated node_modules package) is inherited.
  for (const key of ['disabled', 'onClick', 'type']) {
    assert.equal(button.props[key].inherited, true, `"${key}" should be flagged inherited`);
  }
  assert.notEqual(button.props.variant.inherited, true, 'an own prop is not flagged inherited');
});

// ── Discovery shape must be unchanged (existing callers depend on it) ─────────

test('return shape is preserved: components[], byName Map, scannedPatterns', () => {
  const result = discover();
  assert.ok(Array.isArray(result.components), 'components is an array');
  assert.ok(result.byName instanceof Map, 'byName is a Map');
  assert.deepEqual(result.scannedPatterns, PATTERNS);
  const button = result.components.find((c) => c.name === 'Button');
  assert.ok(button.path && button.discoveredFrom, 'component carries path + discoveredFrom');
});

// ── Integration (best-effort): the real SecuraMark Button ───────────────────
// Skipped automatically when the sibling repo is not present (e.g. cloud runs).

const SECURAMARK_DIR = process.env.SECURAMARK_DIR || join(homedir(), 'Projects/securamark-frontend');
const hasSecuraMark = existsSync(join(SECURAMARK_DIR, 'src/components/ui/Button.tsx'));

test('integration: real SecuraMark Button resolves props + variants + sizes', {
  skip: hasSecuraMark ? false : 'SecuraMark source not available locally',
}, () => {
  const { byName } = discoverComponents(SECURAMARK_DIR, {
    patterns: ['src/components/ui/**/*.{tsx,ts}'],
  });
  const button = byName.get('Button');
  assert.ok(button, 'real Button should be discovered');
  assert.ok(Object.keys(button.props).length > 50, 'full catalogue includes the inherited DOM surface');
  assert.deepEqual(
    sorted(button.variants),
    ['danger', 'ghost', 'outline', 'primary', 'success', 'wechat'],
  );
  assert.deepEqual(sorted(button.sizes), ['lg', 'md', 'sm']);

  // Own (authored) props are a small set and include the component's real API;
  // the DOM/aria/event attributes are segmented out as inherited.
  const own = Object.keys(button.props).filter((k) => !button.props[k].inherited);
  for (const key of ['variant', 'size', 'iconPosition', 'className', 'iconOnly', 'icon', 'children']) {
    assert.ok(own.includes(key), `own props should include authored "${key}"`);
  }
  assert.ok(own.length <= 12, `own props should be a small authored set, got ${own.length}: ${own}`);
  assert.equal(button.props.onClick?.inherited, true, 'onClick is an inherited DOM attribute');
});
