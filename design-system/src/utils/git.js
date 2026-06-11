import { execFileSync } from 'child_process';

// Minimal git helpers for the gated edit loop. Every mutating operation takes
// explicit pathspecs so a session can never touch files outside its scope.
// All functions throw on git failure (callers surface structured errors).

function git(cwd, args, options = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

const splitLines = (out) => out.split('\n').map((l) => l.trim()).filter(Boolean);

/** Absolute path of the repository root containing cwd. */
export function repoRoot(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel']).trim();
}

/** HEAD commit sha. Throws a clear error on an unborn branch (no commits yet). */
export function headSha(cwd) {
  try {
    return git(cwd, ['rev-parse', 'HEAD']).trim();
  } catch {
    throw new Error('This repository has no commits yet (unborn HEAD). Make an initial commit first.');
  }
}

/** Current branch name (or null when detached). */
export function currentBranch(cwd) {
  const name = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  return name === 'HEAD' ? null : name;
}

/** `git status --porcelain` lines limited to the given pathspecs (index + worktree). */
export function statusPorcelain(cwd, pathspecs = []) {
  return splitLines(git(cwd, ['status', '--porcelain', '--', ...pathspecs]));
}

/** Tracked files changed between ref and the working tree, within pathspecs. */
export function diffNames(cwd, ref, pathspecs = []) {
  return splitLines(git(cwd, ['diff', '--name-only', ref, '--', ...pathspecs]));
}

/** Unified diff text between ref and the working tree, within pathspecs. */
export function diffText(cwd, ref, pathspecs = []) {
  return git(cwd, ['diff', ref, '--', ...pathspecs], { maxBuffer: 32 * 1024 * 1024 });
}

/** Files ADDED (tracked) since ref, within pathspecs — these must be deleted on revert. */
export function addedSince(cwd, ref, pathspecs = []) {
  return splitLines(git(cwd, ['diff', '--name-only', '--diff-filter=A', ref, '--', ...pathspecs]));
}

/** Untracked (non-ignored) files within pathspecs. */
export function untracked(cwd, pathspecs = []) {
  return splitLines(git(cwd, ['ls-files', '--others', '--exclude-standard', '--', ...pathspecs]));
}

/** Files that existed at ref within pathspecs (restore source candidates). */
export function filesAtRef(cwd, ref, pathspecs = []) {
  return splitLines(git(cwd, ['ls-tree', '-r', '--name-only', ref, '--', ...pathspecs]));
}

/** Stage and commit ONLY the given pathspecs. Returns the new commit sha. */
export function commitPaths(cwd, message, pathspecs) {
  if (!pathspecs?.length) throw new Error('commitPaths requires explicit pathspecs');
  git(cwd, ['add', '--', ...pathspecs]);
  git(cwd, ['commit', '-m', message, '--', ...pathspecs]);
  return headSha(cwd);
}

/** Restore index + worktree to ref for the given pathspecs (tracked files only). */
export function restoreFromRef(cwd, ref, pathspecs) {
  if (!pathspecs?.length) throw new Error('restoreFromRef requires explicit pathspecs');
  git(cwd, ['restore', '--source', ref, '--staged', '--worktree', '--', ...pathspecs]);
}
