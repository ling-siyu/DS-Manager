import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { applyEdits, buildSystemContext, buildFileContext, shotPairs } from '../src/utils/ai-engine.js';

// Pure engine parts — no API calls. The propose/verify calls are exercised by
// the live `dsm edit run` E2E (requires ANTHROPIC_API_KEY).

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'dsm-ai-'));
  mkdirSync(join(root, 'design-system/src/components/ui'), { recursive: true });
  writeFileSync(join(root, 'design-system/tokens.json'), JSON.stringify({
    primitive: { color: { brand: { 500: { $value: '#6366f1', $type: 'color' } } } },
    semantic: { color: { accent: { $value: '{primitive.color.brand.500}', $type: 'color' } } },
  }));
  writeFileSync(join(root, 'design-system/components.json'), JSON.stringify({
    components: [{ name: 'Button', path: 'src/components/ui/Button.tsx' }],
  }));
  writeFileSync(
    join(root, 'design-system/src/components/ui/Button.tsx'),
    'export default function Button() {\n  return <button>hi</button>;\n}\n',
  );
  const paths = {
    repoRoot: root,
    dsRoot: join(root, 'design-system'),
    tokensPath: join(root, 'design-system/tokens.json'),
    componentsPath: join(root, 'design-system/components.json'),
  };
  return { root, paths };
}

test('applyEdits applies a unique match and reports scope/existence/ambiguity failures', () => {
  const { root } = makeRepo();
  try {
    writeFileSync(join(root, 'design-system/a.txt'), 'alpha beta gamma\n');
    writeFileSync(join(root, 'design-system/b.txt'), 'dup dup\n');
    writeFileSync(join(root, 'outside.txt'), 'alpha\n');

    const { applied, failed } = applyEdits(
      [
        { file: 'design-system/a.txt', search: 'beta', replace: 'BETA' },          // ok
        { file: 'design-system/b.txt', search: 'dup', replace: 'X' },              // ambiguous
        { file: 'outside.txt', search: 'alpha', replace: 'X' },                    // out of scope
        { file: 'design-system/missing.txt', search: 'x', replace: 'y' },          // missing
        { file: 'design-system/a.txt', search: 'not-here', replace: 'y' },         // not found
        { file: '../../etc/hosts', search: 'x', replace: 'y' },                    // escape attempt
      ],
      { repoRoot: root, scope: ['design-system'] },
    );

    assert.deepEqual(applied, [{ file: 'design-system/a.txt' }]);
    assert.equal(readFileSync(join(root, 'design-system/a.txt'), 'utf8'), 'alpha BETA gamma\n');
    assert.equal(readFileSync(join(root, 'design-system/b.txt'), 'utf8'), 'dup dup\n', 'ambiguous edit not applied');

    const reasons = Object.fromEntries(failed.map((f) => [f.file, f.reason]));
    assert.match(reasons['design-system/b.txt'], /more than once/);
    assert.match(reasons['outside.txt'], /outside the session scope/);
    assert.match(reasons['design-system/missing.txt'], /does not exist/);
    assert.match(reasons['design-system/a.txt'], /not found/);
    assert.match(reasons['../../etc/hosts'], /outside the repository/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildSystemContext embeds resolved token reference; buildFileContext returns editable files', () => {
  const { root, paths } = makeRepo();
  try {
    const system = buildSystemContext(paths);
    assert.match(system, /primitive\.color\.brand\.500 = #6366f1/);
    assert.match(system, /semantic\.color\.accent = #6366f1/, 'reference resolved in the token ref');
    assert.match(system, /EXACTLY ONCE/);

    const files = buildFileContext(paths);
    const filePaths = files.map((f) => f.path).sort();
    assert.deepEqual(filePaths, ['design-system/src/components/ui/Button.tsx', 'design-system/tokens.json']);
    assert.match(files.find((f) => f.path.endsWith('Button.tsx')).content, /return <button>/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('shotPairs maps a diff report to before/after PNG paths', () => {
  const report = { pairs: [{ shot: 'dsm-Button-s0.png', changedPct: 1.5 }] };
  const pairs = shotPairs(report, '/tmp/art');
  assert.deepEqual(pairs, [{
    shot: 'dsm-Button-s0.png',
    before: '/tmp/art/shots/before/dsm-Button-s0.png',
    after: '/tmp/art/shots/after/dsm-Button-s0.png',
    changedPct: 1.5,
  }]);
});
