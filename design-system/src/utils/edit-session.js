import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import * as git from './git.js';
import { loadRawTokens, flattenTokens, resolveReference } from './tokens.js';
import { runBuild } from '../commands/build.js';
import { typecheckFiles, typecheckTargetChanges } from './typecheck.js';

// Git-gated edit sessions: the deterministic core of the AI edit loop.
// A session pins a baseRef and a scope; every mutation the loop later commits
// (approve) or undoes (revert) is constrained to that scope. State lives in
// <repoRoot>/.dsm-edit/session.json (single active session); per-session
// artifacts (screenshots, diffs, results) in <repoRoot>/.dsm-edit/<id>/.

const SESSION_FILE = 'session.json';

export function editRoot(repoRoot) {
  return join(repoRoot, '.dsm-edit');
}

function sessionPath(repoRoot) {
  return join(editRoot(repoRoot), SESSION_FILE);
}

export function artifactDir(repoRoot, session) {
  return join(editRoot(repoRoot), session.id);
}

export function loadSession(repoRoot) {
  const p = sessionPath(repoRoot);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function requireSession(repoRoot) {
  const session = loadSession(repoRoot);
  if (!session) {
    throw new Error('No active edit session. Run `dsm edit start` first.');
  }
  return session;
}

/** The sandbox branch an external target must be on for the loop to touch it.
 *  Overridable for tests / alternate conventions. */
export const SANDBOX_BRANCH = process.env.DSM_SANDBOX_BRANCH || 'dsm-experiment';

/**
 * Gate for which repository the edit loop may mutate:
 *   - DSM's own repo → always allowed (unchanged behaviour).
 *   - any external target → allowed ONLY when it is checked out on the sandbox
 *     branch (isolated, never-pushed). Refuses on its real branches.
 * `targetGitRoot` is the git root of the files to be edited; `packageRoot` locates
 * DSM's own repo.
 */
export function assertEditableTarget(targetGitRoot, packageRoot, options = {}) {
  const { sandboxBranch = SANDBOX_BRANCH } = options;
  const ownGitRoot = git.repoRoot(packageRoot);
  if (resolve(targetGitRoot) === resolve(ownGitRoot)) return; // own repo
  const branch = git.currentBranch(targetGitRoot);
  if (branch !== sandboxBranch) {
    throw new Error(
      `Refusing to edit external target ${targetGitRoot}: it must be on the sandbox branch ` +
      `"${sandboxBranch}" (currently ${branch ?? 'detached HEAD'}). ` +
      `Switch with:  git -C ${targetGitRoot} checkout ${sandboxBranch}`,
    );
  }
}

const toPosix = (p) => p.split(sep).join('/');

/** Is `file` (repoRoot-relative) inside any of the scope pathspecs?
 *  A scope entry of '.' means the whole repo. */
function inScope(file, scope) {
  return scope.some((s) => s === '.' || file === s || file.startsWith(`${s.replace(/\/$/, '')}/`));
}

/** The directory sessions live under: always the GIT root (paths.repoRoot can
 *  sit deeper in monorepo layouts — sessions must resolve consistently). */
export function sessionRoot(paths) {
  return git.repoRoot(paths.repoRoot);
}

export function startSession(paths, options = {}) {
  const { scope: userScope, allowDirty = false, force = false, targetRoot = null, target = null } = options;
  const external = !!target;
  // For an external target the files (and git ops) live in its own repo; for
  // DSM's own repo the session root is paths.repoRoot.
  const root = git.repoRoot(targetRoot ?? paths.repoRoot);

  const existing = loadSession(root);
  if (existing && !force) {
    throw new Error(
      `An edit session is already active (${existing.id}, started ${existing.startedAt}). ` +
      'Finish it with `dsm edit approve|revert|abandon`, or pass --force to discard its record.',
    );
  }

  const baseRef = git.headSha(root); // throws helpfully on unborn HEAD
  const branch = git.currentBranch(root);

  // Scope is stored repoRoot-relative. An external target has no design-system/
  // layout to default to, so --scope is required there; DSM defaults to design-system/.
  if (external && !userScope?.length) {
    throw new Error('--scope is required when editing an external target (no default scope).');
  }
  const scope = (userScope?.length ? userScope : [relative(root, paths.dsRoot) || '.'])
    .map((s) => toPosix(relative(root, resolve(root, s)) || '.'));

  // Build artifacts are git-TRACKED and regenerated whenever tokens build, so
  // any session that can touch tokens.json must also own build/ — otherwise
  // approve leaves dirty artifacts and revert leaves them at the edited state.
  // This only applies to DSM's own token pipeline; external targets own neither.
  const tokensRel = toPosix(relative(root, paths.tokensPath));
  const buildRel = toPosix(relative(root, paths.buildDir));
  const tokensInScope = !external && inScope(tokensRel, scope);
  const effectiveScope = [...scope];
  if (tokensInScope && !inScope(buildRel, effectiveScope)) {
    effectiveScope.push(buildRel);
  }

  if (!allowDirty) {
    const dirty = git.statusPorcelain(root, effectiveScope);
    if (dirty.length) {
      throw new Error(
        `Working tree is not clean within scope (${dirty.length} entries):\n  ` +
        dirty.slice(0, 12).join('\n  ') +
        (dirty.length > 12 ? `\n  …and ${dirty.length - 12} more` : '') +
        '\nCommit/stash first, or pass --allow-dirty to accept pre-existing changes as part of the session.',
      );
    }
  }

  const id = `s-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}`;
  const session = {
    id,
    baseRef,
    branch,
    scope,
    effectiveScope,
    tokensInScope,
    external,
    target,
    startedAt: new Date().toISOString(),
    repoRoot: root,
  };

  mkdirSync(artifactDir(root, session), { recursive: true });
  // Self-ignoring artifact dir: works in any repo without touching its .gitignore.
  writeFileSync(join(editRoot(root), '.gitignore'), '*\n');
  writeFileSync(sessionPath(root), `${JSON.stringify(session, null, 2)}\n`);
  return session;
}

/** Tracked-changed + untracked files within the session scope (repoRoot-relative). */
export function changedFiles(session) {
  const root = session.repoRoot;
  const tracked = git.diffNames(root, session.baseRef, session.effectiveScope);
  const fresh = git.untracked(root, session.effectiveScope);
  return { tracked, untracked: fresh, all: [...new Set([...tracked, ...fresh])] };
}

export function sessionStatus(paths, session) {
  const root = session.repoRoot;
  const changes = changedFiles(session);
  const head = git.headSha(root);
  return {
    session,
    headDrift: head !== session.baseRef ? { baseRef: session.baseRef, head } : null,
    changedFiles: changes.all,
    artifactDir: artifactDir(root, session),
  };
}

/** Locate an external target's tsconfig (flat config; common Vite variants). */
function targetTsconfig(root) {
  for (const name of ['tsconfig.json', 'tsconfig.app.json']) {
    const p = join(root, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Type-check an external target's changed files. STRICT against the target's own
 * tsconfig (aliases, strict mode) when one exists, reporting only edit-introduced
 * errors (baseRef-vs-current diff); degrades to parse-only if there's no tsconfig
 * or the program fails to load (never blocks the gate on tooling failure).
 */
function checkExternalTypes(root, session, changes, sourceFiles) {
  const tsConfigFilePath = targetTsconfig(root);
  if (!tsConfigFilePath) return typecheckFiles(sourceFiles, { lenient: true });

  const baseTextByFile = new Map();
  for (const rel of changes.all) {
    if (!/\.(ts|tsx)$/.test(rel) || rel.endsWith('.d.ts')) continue;
    const abs = join(root, rel);
    if (!existsSync(abs)) continue; // deleted in working tree — nothing to check
    baseTextByFile.set(abs, git.showFileAtRef(root, session.baseRef, rel) ?? '');
  }
  try {
    return typecheckTargetChanges({ tsConfigFilePath, files: sourceFiles, baseTextByFile }).introduced;
  } catch {
    return typecheckFiles(sourceFiles, { lenient: true });
  }
}

/** Unresolved-{ref} validation: clearer than letting Style Dictionary throw. */
function validateTokenRefs(tokensPath) {
  const flat = flattenTokens(loadRawTokens(tokensPath));
  const unresolved = [];
  for (const [path, token] of Object.entries(flat)) {
    const value = token.$value;
    if (typeof value === 'string' && value.startsWith('{')) {
      const resolved = resolveReference(value, flat);
      if (typeof resolved === 'string' && /^\{.*\}$/.test(resolved)) {
        unresolved.push({ path, value });
      }
    }
  }
  return unresolved;
}

/**
 * Type-check changed source files and validate/rebuild tokens when they changed.
 * Pure data result — the loop's cheapest gate before any rendering.
 */
export async function checkSession(paths, session) {
  const root = session.repoRoot;
  const changes = changedFiles(session);
  const result = { ok: true, files: changes.all, typecheck: [], tokens: null };

  const sourceFiles = changes.all
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))
    .map((f) => join(root, f))
    .filter((f) => existsSync(f));
  if (sourceFiles.length) {
    // External targets: strict against the target's own tsconfig, but only failing
    // on edit-introduced errors (parse-only fallback if no tsconfig). DSM: as before.
    result.typecheck = session.external
      ? checkExternalTypes(root, session, changes, sourceFiles)
      : typecheckFiles(sourceFiles);
    if (result.typecheck.some((d) => d.category === 'error')) result.ok = false;
  }

  // Token validation/rebuild is DSM-pipeline-specific; external targets don't own
  // tokens.json, so skip it entirely (nothing in their scope can be DSM's tokens).
  const tokensRel = toPosix(relative(root, paths.tokensPath));
  if (!session.external && changes.all.includes(tokensRel)) {
    const tokens = { changed: true, parse: 'ok', unresolvedRefs: [], build: 'ok' };
    try {
      JSON.parse(readFileSync(paths.tokensPath, 'utf8'));
      tokens.unresolvedRefs = validateTokenRefs(paths.tokensPath);
      if (tokens.unresolvedRefs.length) {
        tokens.build = 'skipped';
        result.ok = false;
      } else {
        await runBuild(paths);
      }
    } catch (error) {
      tokens.parse = error.message;
      tokens.build = 'skipped';
      result.ok = false;
    }
    result.tokens = tokens;
  }

  return result;
}

export function approveSession(paths, session, message) {
  const root = session.repoRoot;
  const head = git.headSha(root);
  if (head !== session.baseRef) {
    throw new Error(
      `HEAD moved during the session (base ${session.baseRef.slice(0, 8)} → ${head.slice(0, 8)}). ` +
      'Review manually; approve refuses to commit on a drifted base.',
    );
  }
  const changes = changedFiles(session);
  if (!changes.all.length) {
    throw new Error('Nothing to approve: no changes within the session scope.');
  }
  const commit = git.commitPaths(root, message, session.effectiveScope);
  endSession(root, session, { outcome: 'approved', commit, files: changes.all });
  return { commit, files: changes.all };
}

export function revertSession(paths, session) {
  const root = session.repoRoot;
  const changes = changedFiles(session);

  // Files created since baseRef (tracked-added or untracked) must be deleted —
  // `git restore` would error on them ("did not exist at ref").
  const added = git.addedSince(root, session.baseRef, session.effectiveScope);
  const toDelete = [...new Set([...added, ...changes.untracked])];
  for (const file of toDelete) {
    try { unlinkSync(join(root, file)); } catch { /* already gone */ }
  }

  // Restore tracked files that existed at baseRef. Because build/ artifacts are
  // tracked and inside the effective scope, this also restores them — no
  // post-revert rebuild needed.
  const toRestore = changes.tracked.filter((f) => !added.includes(f));
  if (toRestore.length) git.restoreFromRef(root, session.baseRef, toRestore);

  endSession(root, session, { outcome: 'reverted', restored: toRestore, deleted: toDelete });
  return { restored: toRestore, deleted: toDelete };
}

export function abandonSession(session) {
  const root = session.repoRoot;
  endSession(root, session, { outcome: 'abandoned' });
  return { kept: changedFilesSafe(session) };
}

function changedFilesSafe(session) {
  try { return changedFiles(session).all; } catch { return []; }
}

function endSession(root, session, result) {
  try {
    writeFileSync(
      join(artifactDir(root, session), 'result.json'),
      `${JSON.stringify({ ...result, endedAt: new Date().toISOString() }, null, 2)}\n`,
    );
  } catch { /* artifact dir may have been removed manually */ }
  try { unlinkSync(sessionPath(root)); } catch { /* already gone */ }
}

/** Remove a session's artifact directory (used by tests). */
export function removeArtifacts(root, session) {
  rmSync(artifactDir(root, session), { recursive: true, force: true });
}
