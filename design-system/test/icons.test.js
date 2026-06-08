import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { captureIconUsage } from '../src/utils/icons.js';

const ICONS_DATA = {
  sets: {
    phosphor: { source: '@phosphor-icons/react', defaultWeight: 'light' },
    lucide: { source: 'lucide-react' },
  },
};

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'dsm-icons-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, 'src', name), content);
  }
  return root;
}

test('captureIconUsage detects Phosphor as the primary set with used icons + counts', () => {
  const root = fixture({
    'A.tsx': "import { Lock, ShieldCheck } from '@phosphor-icons/react';\nexport const A = () => <Lock/>;",
    'B.tsx': "import { Lock } from '@phosphor-icons/react';\nexport const B = () => <Lock/>;",
  });
  try {
    const cap = captureIconUsage(join(root, 'src'), ICONS_DATA);
    assert.equal(cap.set, 'phosphor');
    assert.equal(cap.source, '@phosphor-icons/react');
    const lock = cap.icons.find((i) => i.name === 'Lock');
    assert.equal(lock.count, 2, 'Lock used in 2 files');
    assert.ok(cap.icons.some((i) => i.name === 'ShieldCheck'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('captureIconUsage reads the IconContext weight as the style', () => {
  const root = fixture({
    'App.tsx': "import { IconContext, Lock } from '@phosphor-icons/react';\n<IconContext.Provider value={{ weight: 'light', size: 20 }}>x</IconContext.Provider>",
  });
  try {
    const cap = captureIconUsage(join(root, 'src'), ICONS_DATA);
    assert.equal(cap.style.weight, 'light');
    // IconContext is filtered out of the icon list.
    assert.ok(!cap.icons.some((i) => i.name === 'IconContext'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('captureIconUsage ignores example imports inside block comments', () => {
  const root = fixture({
    'doc.ts': "/**\n * Example: import { Search, X } from 'lucide-react'\n */\nexport const x = 1;",
  });
  try {
    const cap = captureIconUsage(join(root, 'src'), ICONS_DATA);
    assert.equal(cap.set, null, 'a commented example import is not real usage');
    assert.equal(cap.icons.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('captureIconUsage returns an empty capture when no icon imports exist', () => {
  const root = fixture({ 'plain.ts': 'export const n = 42;' });
  try {
    const cap = captureIconUsage(join(root, 'src'), ICONS_DATA);
    assert.equal(cap.set, null);
    assert.deepEqual(cap.icons, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
