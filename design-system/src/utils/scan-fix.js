import { readFileSync, writeFileSync } from 'fs';
import { relative, resolve, extname } from 'path';
import { loadTokens, buildValueIndex, normalizeHex } from './tokens.js';

// Deterministic fixer for `dsm scan --fix`: replaces hardcoded HEX colors with
// var(--ds-…) token references. Hex only — the other scan patterns either
// capture truncated matches (rgb/hsl) or require class-level judgment
// (arbitrary Tailwind values); those are the driving agent's job. Runs inside
// a gated edit session so every change is approvable/revertible.

// Match a full hex color with its index (scan.js's display regex, anchored to
// the complete value). 3/4/6/8 digit forms matched; alpha forms are skipped at
// normalize time and reported.
const HEX_RE = /(?<!--[\w-]+:\s*)(?<!['"`(])(?<!var\()#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

const CSS_EXTENSIONS = new Set(['.css', '.scss']);

/** In CSS files only fix hexes in value position (after `:` in a declaration) —
 *  `#cafe { … }` is a perfectly legal id selector. */
function inCssValuePosition(source, matchIndex) {
  const lineStart = source.lastIndexOf('\n', matchIndex - 1) + 1;
  const before = source.slice(lineStart, matchIndex);
  return /:[^;{}]*$/.test(before);
}

/**
 * Apply unambiguous hex→token fixes to the given files (absolute paths).
 * Returns { fixed: [{file,line,value,token,cssVar}], skipped: [{file,line,value,reason,candidates?}] }.
 */
export function applyHexFixes(files, { tokensPath, cwd = process.cwd() }) {
  const index = buildValueIndex(loadTokens(tokensPath));
  const fixed = [];
  const skipped = [];

  for (const absFile of files) {
    let source;
    try {
      source = readFileSync(absFile, 'utf8');
    } catch {
      continue;
    }
    const relFile = relative(cwd, absFile);
    const isCss = CSS_EXTENSIONS.has(extname(absFile));
    const replacements = [];

    HEX_RE.lastIndex = 0;
    let match;
    while ((match = HEX_RE.exec(source)) !== null) {
      const value = match[0];
      const line = source.slice(0, match.index).split('\n').length;
      const normalized = normalizeHex(value);

      if (!normalized) {
        skipped.push({ file: relFile, line, value, reason: 'alpha-hex' });
        continue;
      }
      if (isCss && !inCssValuePosition(source, match.index)) {
        skipped.push({ file: relFile, line, value, reason: 'not-a-css-value' });
        continue;
      }

      const candidates = index.get(normalized) ?? [];
      const semantic = candidates.filter((c) => c.path.startsWith('semantic.'));
      const winner =
        candidates.length === 1 ? candidates[0]
        : semantic.length === 1 ? semantic[0]
        : null;

      if (!winner) {
        skipped.push({
          file: relFile,
          line,
          value,
          reason: candidates.length ? 'ambiguous' : 'no-matching-token',
          ...(candidates.length ? { candidates: candidates.map((c) => c.path) } : {}),
        });
        continue;
      }

      replacements.push({ start: match.index, end: match.index + value.length, value, line, winner });
    }

    if (replacements.length) {
      // Apply end→start so earlier indices stay valid.
      let updated = source;
      for (const r of [...replacements].reverse()) {
        updated = `${updated.slice(0, r.start)}var(${r.winner.cssVar})${updated.slice(r.end)}`;
      }
      writeFileSync(absFile, updated);
      for (const r of replacements) {
        fixed.push({ file: relFile, line: r.line, value: r.value, token: r.winner.path, cssVar: r.winner.cssVar });
      }
    }
  }

  return { fixed, skipped };
}

/** Files from scan results (file paths relative to scan root) → absolute, filtered to session scope. */
export function fixableFiles(scanResults, absolutePath, session) {
  const inScope = (repoRel) =>
    session.effectiveScope.some((s) => repoRel === s || repoRel.startsWith(`${s.replace(/\/$/, '')}/`));

  const eligible = [];
  const outOfScope = [];
  for (const { file, violations } of scanResults) {
    if (!violations.some((v) => v.patternId === 'hex-color')) continue;
    const abs = resolve(absolutePath, file);
    const repoRel = relative(session.repoRoot, abs);
    if (repoRel.startsWith('..')) {
      outOfScope.push(file);
    } else if (inScope(repoRel)) {
      eligible.push(abs);
    } else {
      outOfScope.push(file);
    }
  }
  return { eligible, outOfScope };
}
