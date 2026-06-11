import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Pixel-level before/after comparison for edit-loop screenshots. Robust to
// dimension changes (a padding/size edit legitimately changes shot height):
// images are padded onto a common canvas and the report flags the change
// instead of throwing.

function padTo(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height }); // transparent
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

/** Compare one before/after PNG pair; writes a diff PNG. */
export function diffPair(beforeFile, afterFile, diffFile) {
  const before = PNG.sync.read(readFileSync(beforeFile));
  const after = PNG.sync.read(readFileSync(afterFile));

  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const dimensionsChanged = before.width !== after.width || before.height !== after.height;

  const a = padTo(before, width, height);
  const b = padTo(after, width, height);
  const diff = new PNG({ width, height });

  const changedPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
    includeAA: false,
  });
  writeFileSync(diffFile, PNG.sync.write(diff));

  return {
    changedPixels,
    totalPixels: width * height,
    changedPct: Number(((changedPixels / (width * height)) * 100).toFixed(3)),
    dimensionsChanged,
    before: { width: before.width, height: before.height },
    after: { width: after.width, height: after.height },
  };
}

/**
 * Diff every same-named PNG in beforeDir vs afterDir into outDir.
 * Returns { pairs: [{shot, changedPct, …}], missingBefore: [], missingAfter: [] }.
 */
export function diffShotDirs(beforeDir, afterDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  const beforeFiles = existsSync(beforeDir) ? readdirSync(beforeDir).filter((f) => f.endsWith('.png')) : [];
  const afterFiles = existsSync(afterDir) ? readdirSync(afterDir).filter((f) => f.endsWith('.png')) : [];
  const beforeSet = new Set(beforeFiles);
  const afterSet = new Set(afterFiles);

  const pairs = [];
  for (const shot of beforeFiles.filter((f) => afterSet.has(f)).sort()) {
    const result = diffPair(join(beforeDir, shot), join(afterDir, shot), join(outDir, shot));
    pairs.push({ shot, ...result, diff: join(outDir, shot) });
  }

  return {
    pairs,
    missingBefore: afterFiles.filter((f) => !beforeSet.has(f)).sort(),
    missingAfter: beforeFiles.filter((f) => !afterSet.has(f)).sort(),
  };
}
