import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  titleCaseSegment,
  categoryFromPath,
  categoryFromStory,
  resolveCategory,
} from '../src/utils/categorize.js';

test('titleCaseSegment humanizes kebab/camel segments', () => {
  assert.equal(titleCaseSegment('ui'), 'Ui');
  assert.equal(titleCaseSegment('image-with-skeleton'), 'Image With Skeleton');
  assert.equal(titleCaseSegment('illustrations'), 'Illustrations');
});

test('categoryFromPath strips conventional roots and keeps nesting', () => {
  assert.equal(categoryFromPath('src/components/Landing/illustrations/Foo.tsx'), 'Landing/Illustrations');
  assert.equal(categoryFromPath('src/components/ui/Button.tsx'), 'Ui');
  assert.equal(categoryFromPath('src/pages/LandingPage.tsx'), 'Pages');
  assert.equal(categoryFromPath('Button.tsx'), 'Uncategorized');
});

test('categoryFromStory reads a colocated story title minus its leaf', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsm-cat-'));
  const sub = join(dir, 'ui');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'Button.tsx'), 'export default function Button() {}\n');
  writeFileSync(join(sub, 'Button.stories.tsx'), "const meta = { title: 'UI/Button' };\nexport default meta;\n");
  // Nested title
  writeFileSync(join(sub, 'Frame.tsx'), 'export default function Frame() {}\n');
  writeFileSync(join(sub, 'Frame.stories.tsx'), "export default { title: 'Landing/Illustrations/Frame' }\n");
  // Single-segment title → no category
  writeFileSync(join(sub, 'Loose.tsx'), 'export default function Loose() {}\n');
  writeFileSync(join(sub, 'Loose.stories.tsx'), "export default { title: '提示' }\n");

  assert.equal(categoryFromStory(join(sub, 'Button.tsx')), 'UI');
  assert.equal(categoryFromStory(join(sub, 'Frame.tsx')), 'Landing/Illustrations');
  assert.equal(categoryFromStory(join(sub, 'Loose.tsx')), null);
  assert.equal(categoryFromStory(join(sub, 'Frame.tsx')) && categoryFromStory(join(dir, 'Missing.tsx')), null);
});

test('resolveCategory layers explicit > story title > path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsm-cat-'));
  mkdirSync(join(dir, 'src', 'components', 'ui'), { recursive: true });
  const abs = join(dir, 'src', 'components', 'ui', 'Button.tsx');
  writeFileSync(abs, 'export default function Button() {}\n');
  writeFileSync(join(dir, 'src', 'components', 'ui', 'Button.stories.tsx'), "export default { title: 'UI/Button' }\n");

  // explicit wins
  assert.equal(resolveCategory({ path: 'src/components/ui/Button.tsx', absPath: abs, explicit: 'Forms' }), 'Forms');
  // story title beats path (correct casing)
  assert.equal(resolveCategory({ path: 'src/components/ui/Button.tsx', absPath: abs }), 'UI');
  // path fallback when no story / no explicit
  assert.equal(resolveCategory({ path: 'src/components/Gallery/Card.tsx', absPath: join(dir, 'nope.tsx') }), 'Gallery');
});
