import { existsSync, readFileSync } from 'fs';
import { dirname, join, basename, extname } from 'path';

// Component categorization — universal, layered resolution:
//   1. explicit `category` in the registry (manual curation wins)
//   2. a colocated Storybook story's `title` (minus its leaf) — matches the
//      taxonomy the designer already sees, with correct casing/nesting
//   3. the file path (dir segments under the project root) — works for ANY
//      project layout (domain folders, atomic design, monorepo packages)
//   4. 'Uncategorized'
//
// Categories are '/'-delimited paths (Storybook's convention), so they nest.

const STORY_EXTS = ['.stories.tsx', '.stories.jsx', '.stories.ts', '.stories.mjs', '.stories.js'];

// Conventional source-root segments stripped from the head of a path so the
// category starts at the first meaningful folder (Landing, ui, Gallery, …).
const ROOT_SEGMENTS = new Set(['src', 'app', 'components', 'packages', 'lib']);

/** "image-with-skeleton" / "ui" → "Image With Skeleton" / "Ui". */
export function titleCaseSegment(seg) {
  return seg
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Category from a repo-relative path: the dir segments between the project
 *  root and the file, title-cased and '/'-joined. */
export function categoryFromPath(relPath) {
  if (!relPath) return 'Uncategorized';
  const parts = relPath.split(/[\\/]/).slice(0, -1); // drop the filename
  let i = 0;
  while (i < parts.length && ROOT_SEGMENTS.has(parts[i].toLowerCase())) i += 1;
  const segs = parts.slice(i);
  if (!segs.length) return 'Uncategorized';
  return segs.map(titleCaseSegment).join('/');
}

/** Category from a colocated Storybook story's `title` (everything before the
 *  leaf). `<dir>/<Stem>.stories.*` next to `<dir>/<Stem>.tsx`. Returns null when
 *  there is no story, no parseable title, or the title has no category segment. */
export function categoryFromStory(absPath) {
  if (!absPath || !existsSync(absPath)) return null;
  const dir = dirname(absPath);
  const stem = basename(absPath, extname(absPath));
  for (const ext of STORY_EXTS) {
    const storyPath = join(dir, stem + ext);
    if (!existsSync(storyPath)) continue;
    try {
      const src = readFileSync(storyPath, 'utf8');
      const m = src.match(/\btitle\s*:\s*['"`]([^'"`]+)['"`]/);
      if (!m) return null;
      const segs = m[1].split('/').map((s) => s.trim()).filter(Boolean);
      return segs.length >= 2 ? segs.slice(0, -1).join('/') : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Resolve a component's category via the layered scheme. `explicit` is the
 * registry's `category` field (if any); `path` is repo-relative; `absPath` is
 * the absolute source path (for the story lookup, optional).
 */
export function resolveCategory({ path: relPath, absPath, explicit } = {}) {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  return categoryFromStory(absPath) ?? categoryFromPath(relPath);
}
