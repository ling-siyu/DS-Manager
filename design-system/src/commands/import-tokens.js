import chalk from 'chalk';
import { existsSync, writeFileSync } from 'fs';
import { resolve, relative } from 'path';
import { loadTsModule } from '../utils/ts-tokens.js';

// DTCG $extensions live under a vendor namespace so they never collide with
// spec fields. We stash theme variants and the Tailwind fontSize line-height
// here — data that has no first-class DTCG home but must survive a round-trip.
const EXT = 'com.securamark';

// ── Conversion: TS token exports → DTCG groups ─────────────────────────────

/** Map a flat `{ key: value }` token object to DTCG leaves of one `$type`. */
function buildSimpleGroup(obj, $type) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = { $value: value, $type };
  }
  return out;
}

/** Colors: dark theme is the canonical `$value`; light variant rides along in
 *  `$extensions` (matches how SecuraMark ships one CSS var overridden under
 *  `[data-theme="light"]`). */
function buildColorGroup(colors, colorsLight) {
  const out = {};
  for (const [key, value] of Object.entries(colors)) {
    const token = { $value: value, $type: 'color' };
    const light = colorsLight?.[key];
    if (light !== undefined && light !== value) {
      token.$extensions = { [EXT]: { themeLight: light } };
    }
    out[key] = token;
  }
  return out;
}

/** fontSize is a `[size, { lineHeight }]` tuple in Tailwind. We keep the size as
 *  the DTCG `$value` (a dimension) and preserve the paired lineHeight verbatim
 *  in `$extensions` so the tuple reconstructs exactly. */
function buildFontSizeGroup(fontSize) {
  const out = {};
  for (const [key, entry] of Object.entries(fontSize)) {
    const [size, meta] = Array.isArray(entry) ? entry : [entry, undefined];
    const token = { $value: size, $type: 'dimension' };
    if (meta && meta.lineHeight !== undefined) {
      token.$extensions = { [EXT]: { lineHeight: meta.lineHeight } };
    }
    out[key] = token;
  }
  return out;
}

/** Semantic typography references primitives by key (`fontSize: 'xl'`); we emit
 *  DTCG aliases (`{fontSize.xl}`) so the references are real and resolvable. */
function buildTypographyGroup(semanticTypography) {
  const out = {};
  for (const [key, def] of Object.entries(semanticTypography)) {
    const value = {};
    if (def.fontFamily !== undefined) value.fontFamily = `{fontFamily.${def.fontFamily}}`;
    if (def.fontSize !== undefined) value.fontSize = `{fontSize.${def.fontSize}}`;
    if (def.fontWeight !== undefined) value.fontWeight = `{fontWeight.${def.fontWeight}}`;
    if (def.letterSpacing !== undefined) value.letterSpacing = `{letterSpacing.${def.letterSpacing}}`;
    if (def.textTransform !== undefined) value.textTransform = def.textTransform;
    const token = { $value: value, $type: 'typography' };
    if (def.usage) token.$description = def.usage;
    out[key] = token;
  }
  return out;
}

/** Semantic transitions reference duration/easing by key — emit aliases too. */
function buildTransitionGroup(animationTransition) {
  const out = {};
  for (const [key, def] of Object.entries(animationTransition)) {
    const value = {};
    if (def.properties !== undefined) value.properties = def.properties;
    if (def.duration !== undefined) value.duration = `{animationDuration.${def.duration}}`;
    if (def.easing !== undefined) value.timingFunction = `{animationEasing.${def.easing}}`;
    const token = { $value: value, $type: 'transition' };
    if (def.usage) token.$description = def.usage;
    out[key] = token;
  }
  return out;
}

/**
 * Convert the runtime exports of a SecuraMark-style token module into a DTCG
 * token tree. Each group is emitted only if the corresponding export exists, so
 * partial token modules import cleanly. Values are passed through verbatim — the
 * importer captures, it does not normalize.
 */
export function convertTokens(exports) {
  const e = exports;
  const dtcg = {};

  if (e.colors) dtcg.color = buildColorGroup(e.colors, e.colorsLight);
  if (e.fontFamily) dtcg.fontFamily = buildSimpleGroup(e.fontFamily, 'fontFamily');
  if (e.fontWeight) dtcg.fontWeight = buildSimpleGroup(e.fontWeight, 'fontWeight');
  if (e.letterSpacing) dtcg.letterSpacing = buildSimpleGroup(e.letterSpacing, 'dimension');
  if (e.fontSize) dtcg.fontSize = buildFontSizeGroup(e.fontSize);
  if (e.animationDuration) dtcg.animationDuration = buildSimpleGroup(e.animationDuration, 'duration');
  if (e.animationEasing) dtcg.animationEasing = buildSimpleGroup(e.animationEasing, 'cubicBezier');
  if (e.borderRadius) dtcg.borderRadius = buildSimpleGroup(e.borderRadius, 'dimension');
  if (e.boxShadow) dtcg.boxShadow = buildSimpleGroup(e.boxShadow, 'shadow');
  if (e.aspectRatio) dtcg.aspectRatio = buildSimpleGroup(e.aspectRatio, 'aspectRatio');
  if (e.iconSize) dtcg.iconSize = buildSimpleGroup(e.iconSize, 'number');
  if (e.semanticTypography) dtcg.semanticTypography = buildTypographyGroup(e.semanticTypography);
  if (e.animationTransition) dtcg.animationTransition = buildTransitionGroup(e.animationTransition);

  return dtcg;
}

// ── Validation: reconstruct the Tailwind theme and diff vs the real config ──

/** Pull `{ key: $value }` out of a DTCG group (the inverse of buildSimpleGroup). */
function groupValues(group) {
  const out = {};
  for (const [key, token] of Object.entries(group || {})) out[key] = token.$value;
  return out;
}

/** Rebuild the `[size, { lineHeight }]` tuples from a DTCG fontSize group. */
function fontSizeValues(group) {
  const out = {};
  for (const [key, token] of Object.entries(group || {})) {
    const lineHeight = token.$extensions?.[EXT]?.lineHeight;
    out[key] = lineHeight !== undefined ? [token.$value, { lineHeight }] : token.$value;
  }
  return out;
}

/**
 * Reconstruct the Tailwind `theme` object that SecuraMark's tailwind.config.js
 * builds, purely from the imported DTCG. If this equals the real config's theme,
 * the importer lost nothing the Tailwind layer cares about.
 */
export function reconstructTailwindTheme(dtcg) {
  return {
    borderRadius: groupValues(dtcg.borderRadius),
    boxShadow: groupValues(dtcg.boxShadow),
    fontFamily: groupValues(dtcg.fontFamily),
    fontWeight: groupValues(dtcg.fontWeight),
    extend: {
      aspectRatio: groupValues(dtcg.aspectRatio),
      letterSpacing: groupValues(dtcg.letterSpacing),
      fontSize: fontSizeValues(dtcg.fontSize),
      transitionDuration: groupValues(dtcg.animationDuration),
      transitionTimingFunction: groupValues(dtcg.animationEasing),
    },
  };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Structural diff. Arrays compared by value (JSON), objects recursed key-wise. */
export function deepDiff(expected, actual, path = '') {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    return JSON.stringify(expected) === JSON.stringify(actual)
      ? []
      : [{ path, expected, actual }];
  }
  if (isObject(expected) && isObject(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    const diffs = [];
    for (const key of keys) {
      diffs.push(...deepDiff(expected[key], actual[key], path ? `${path}.${key}` : key));
    }
    return diffs;
  }
  return expected === actual ? [] : [{ path, expected, actual }];
}

// ── Misc ───────────────────────────────────────────────────────────────────

/** Count leaf tokens ($value present) anywhere in a DTCG tree. */
function countLeaves(node) {
  if (!isObject(node)) return 0;
  if ('$value' in node) return 1;
  return Object.values(node).reduce((sum, child) => sum + countLeaves(child), 0);
}

// ── CLI handler ──────────────────────────────────────────────────────────────

export async function importTokensCommand(source, options = {}) {
  // All human-readable output goes to stderr so `> tokens.json` captures pure
  // JSON when no --output file is given.
  const log = (msg) => process.stderr.write(msg + '\n');

  const entryPath = resolve(source);
  if (!existsSync(entryPath)) {
    log(chalk.red(`\n✗ Source token module not found: ${entryPath}\n`));
    process.exit(1);
  }

  let exports;
  try {
    exports = await loadTsModule(entryPath);
  } catch (err) {
    log(chalk.red('\n✗ Failed to load/transpile the token module:\n'));
    log(err.message);
    process.exit(1);
  }

  const dtcg = convertTokens(exports);
  const groups = Object.keys(dtcg);
  if (groups.length === 0) {
    log(chalk.yellow(
      '\n⚠ No recognized token exports found in the source module.\n' +
      '  Expected named exports like colors, fontFamily, fontSize, etc.\n'
    ));
    process.exit(1);
  }

  const json = JSON.stringify(dtcg, null, 2);

  if (options.output) {
    const outPath = resolve(options.output);
    writeFileSync(outPath, json + '\n', 'utf8');
    log(chalk.green(`\n✓ Imported ${countLeaves(dtcg)} tokens across ${groups.length} groups`));
    log(chalk.dim(`  ${groups.join(', ')}`));
    log(chalk.green(`✓ Wrote DTCG tokens → ${relative(process.cwd(), outPath) || outPath}\n`));
  } else {
    process.stdout.write(json + '\n');
    log(chalk.dim(`\n(imported ${countLeaves(dtcg)} tokens across ${groups.length} groups)`));
  }

  if (options.validate) {
    await runValidation(dtcg, options.validate, log);
  }
}

async function runValidation(dtcg, validatePath, log) {
  const cfgPath = resolve(validatePath);
  if (!existsSync(cfgPath)) {
    log(chalk.red(`\n✗ --validate config not found: ${cfgPath}\n`));
    process.exit(1);
  }

  let cfg;
  try {
    cfg = await loadTsModule(cfgPath);
  } catch (err) {
    log(chalk.red('\n✗ Failed to load the Tailwind config for validation:\n'));
    log(err.message);
    process.exit(1);
  }

  const realTheme = cfg.default?.theme;
  if (!realTheme) {
    log(chalk.red('\n✗ Validation config has no default export `theme`.\n'));
    process.exit(1);
  }

  const reconstructed = reconstructTailwindTheme(dtcg);
  const diffs = deepDiff(realTheme, reconstructed);

  if (diffs.length === 0) {
    log(chalk.green('\n✓ Validation passed — reconstructed Tailwind theme matches the real config exactly.\n'));
    return;
  }

  log(chalk.red(`\n✗ Validation failed — ${diffs.length} mismatch(es) vs the real Tailwind config:\n`));
  for (const { path, expected, actual } of diffs.slice(0, 40)) {
    log(`  ${chalk.bold(path)}`);
    log(`    ${chalk.dim('config:')}   ${JSON.stringify(expected)}`);
    log(`    ${chalk.dim('imported:')} ${JSON.stringify(actual)}`);
  }
  if (diffs.length > 40) log(chalk.dim(`  …and ${diffs.length - 40} more`));
  log('');
  process.exit(1);
}
