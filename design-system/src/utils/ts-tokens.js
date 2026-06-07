import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

/**
 * Transpile + bundle a TypeScript (or JS) module with esbuild and import it,
 * returning its named exports as real runtime values.
 *
 * This is deliberately *not* a static AST/regex parse. SecuraMark's tokens are
 * `as const satisfies T` objects full of arrays, `[size, { lineHeight }]`
 * tuples, `clamp(...)` strings, and spreads — exactly the shapes a static
 * parser mangles (and the reason Phase 2 is replacing the regex component
 * discovery). By bundling and importing we get the same objects a bundler
 * (Vite/Tailwind) would consume, so the values are ground truth by construction.
 *
 * Type-only imports are erased by esbuild; relative imports are inlined by the
 * bundle, so the entry can pull from sibling files (e.g. ./types/*) freely.
 *
 * @param {string} entryPath Absolute path to the module entry to load.
 * @returns {Promise<Record<string, unknown>>} The module's exports.
 */
export async function loadTsModule(entryPath) {
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });

  const code = result.outputFiles[0].text;

  // Import from a temp file rather than a data: URL so relative runtime imports
  // (should any survive bundling) and source maps behave normally. A unique dir
  // per call avoids the ESM module cache returning a stale copy across imports.
  const dir = mkdtempSync(join(tmpdir(), 'dsm-tokens-'));
  const file = join(dir, 'module.mjs');
  writeFileSync(file, code, 'utf8');
  try {
    const mod = await import(pathToFileURL(file).href);
    return { ...mod };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
