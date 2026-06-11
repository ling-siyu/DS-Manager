import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  startSession,
  loadSession,
  changedFiles,
  approveSession,
  revertSession,
  abandonSession,
} from '../src/utils/edit-session.js';
import * as git from '../src/utils/git.js';

// Session lifecycle against a throwaway git repo shaped like a DSM project.

function gitIn(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function makeRepo({ commit = true } = {}) {
  // realpath: macOS tmpdir is a /var → /private/var symlink; git resolves it.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsm-session-')));
  gitIn(root, 'init', '-b', 'main');
  gitIn(root, 'config', 'user.email', 'test@dsm.local');
  gitIn(root, 'config', 'user.name', 'DSM Test');

  mkdirSync(join(root, 'design-system/build'), { recursive: true });
  mkdirSync(join(root, 'design-system/src'), { recursive: true });
  writeFileSync(join(root, 'design-system/tokens.json'), '{"primitive":{}}\n');
  writeFileSync(join(root, 'design-system/build/css-vars.css'), ':root {}\n');
  writeFileSync(join(root, 'design-system/src/Button.tsx'), 'export default () => null;\n');
  writeFileSync(join(root, 'notes.txt'), 'out of scope\n');

  if (commit) {
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-m', 'initial');
  }

  const paths = {
    repoRoot: root,
    dsRoot: join(root, 'design-system'),
    tokensPath: join(root, 'design-system/tokens.json'),
    buildDir: join(root, 'design-system/build'),
    componentsPath: join(root, 'design-system/components.json'),
  };
  return { root, paths };
}

test('start pins baseRef, defaults scope to design-system/, and extends scope with build/', () => {
  const { root, paths } = makeRepo();
  try {
    const session = startSession(paths);
    assert.equal(session.baseRef, git.headSha(root));
    assert.deepEqual(session.scope, ['design-system']);
    // tokens.json is inside the scope → tracked build artifacts join the effective scope
    assert.ok(session.effectiveScope.includes('design-system'));
    assert.ok(loadSession(root), 'session.json written');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('start refuses a dirty tree in scope; --allow-dirty accepts it; out-of-scope dirt is ignored', () => {
  const { root, paths } = makeRepo();
  try {
    // Out-of-scope dirt only → fine
    writeFileSync(join(root, 'notes.txt'), 'changed\n');
    let session = startSession(paths);
    abandonSession(session);

    // In-scope dirt → refused
    writeFileSync(join(root, 'design-system/src/Button.tsx'), 'export default () => 1;\n');
    assert.throws(() => startSession(paths), /not clean within scope/);

    // --allow-dirty
    session = startSession(paths, { allowDirty: true });
    assert.ok(session.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a second start refuses while a session is active unless --force', () => {
  const { root, paths } = makeRepo();
  try {
    startSession(paths);
    assert.throws(() => startSession(paths), /already active/);
    const forced = startSession(paths, { force: true });
    assert.ok(forced.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scope '.' covers the whole repo: tokens detected, build/ already subsumed", () => {
  const { root, paths } = makeRepo();
  try {
    const session = startSession(paths, { scope: ['.'] });
    assert.equal(session.tokensInScope, true, "'.' scope includes tokens.json");
    // '.' subsumes build/ — no explicit extension needed (and approve/revert on
    // pathspec '.' covers the build artifacts).
    assert.deepEqual(session.effectiveScope, ['.']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('start gives a clear error on a repo with no commits', () => {
  const { root, paths } = makeRepo({ commit: false });
  try {
    assert.throws(() => startSession(paths), /no commits yet/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('approve commits ONLY the session scope; out-of-scope changes stay dirty', () => {
  const { root, paths } = makeRepo();
  try {
    const session = startSession(paths);
    writeFileSync(join(root, 'design-system/src/Button.tsx'), 'export default () => 2;\n');
    writeFileSync(join(root, 'notes.txt'), 'unrelated edit\n');

    const result = approveSession(paths, session, 'test approve');
    assert.ok(result.commit);
    assert.deepEqual(result.files, ['design-system/src/Button.tsx']);

    // Scope is committed; notes.txt remains modified-uncommitted.
    const status = git.statusPorcelain(root, []);
    assert.deepEqual(status, ['M notes.txt']);
    assert.equal(loadSession(root), null, 'session ended');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('revert restores tracked edits and deletes files created during the session', () => {
  const { root, paths } = makeRepo();
  try {
    const session = startSession(paths);
    writeFileSync(join(root, 'design-system/src/Button.tsx'), 'export default () => 3;\n');
    writeFileSync(join(root, 'design-system/src/New.tsx'), 'export default () => null;\n');

    const changes = changedFiles(session);
    assert.deepEqual(changes.all.sort(), ['design-system/src/Button.tsx', 'design-system/src/New.tsx']);

    const result = revertSession(paths, session);
    assert.deepEqual(result.restored, ['design-system/src/Button.tsx']);
    assert.deepEqual(result.deleted, ['design-system/src/New.tsx']);

    assert.equal(readFileSync(join(root, 'design-system/src/Button.tsx'), 'utf8'), 'export default () => null;\n');
    assert.ok(!existsSync(join(root, 'design-system/src/New.tsx')));
    assert.deepEqual(git.statusPorcelain(root, ['design-system']), [], 'scope clean after revert');
    assert.equal(loadSession(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('abandon ends the session but keeps the working tree', () => {
  const { root, paths } = makeRepo();
  try {
    const session = startSession(paths);
    writeFileSync(join(root, 'design-system/src/Button.tsx'), 'export default () => 4;\n');
    const result = abandonSession(session);
    assert.deepEqual(result.kept, ['design-system/src/Button.tsx']);
    assert.equal(readFileSync(join(root, 'design-system/src/Button.tsx'), 'utf8'), 'export default () => 4;\n');
    assert.equal(loadSession(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('approve refuses when HEAD drifted past the session base', () => {
  const { root, paths } = makeRepo();
  try {
    const session = startSession(paths);
    writeFileSync(join(root, 'design-system/src/Button.tsx'), 'export default () => 5;\n');
    // Simulate a user commit mid-session (outside the loop's control)
    gitIn(root, 'commit', '-am', 'mid-session user commit');
    assert.throws(() => approveSession(paths, session, 'should fail'), /HEAD moved/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
