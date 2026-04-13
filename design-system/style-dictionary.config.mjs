import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Custom CSS variables formatter.
 * Behaves like `css/variables` with outputReferences, but also expands
 * composite `$type: "typography"` tokens into property-specific CSS vars:
 *   --ds-semantic-typography-body-base-font-size
 *   --ds-semantic-typography-body-base-font-weight
 *   etc.
 */
function dsVariablesFormatter({ dictionary, options = {} }) {
  const selector = options.selector ?? ':root';
  const lines = [`${selector} {`];

  for (const token of dictionary.allTokens) {
    const rawKey = (token.key ?? '').replace(/^\{|\}$/g, '');
    const varBase = `--ds-${rawKey.replace(/\./g, '-')}`;
    const originalVal = token.original?.$value ?? token.original?.value ?? '';
    const resolvedVal = token.$value ?? token.value;
    const desc = token.$description ? ` /** ${token.$description} */` : '';

    // Use original $value for composites — CSS transforms convert the object to
    // a font shorthand string before the formatter runs, so we bypass that here.
    const originalObj = token.original?.$value;
    if (token.$type === 'typography' && originalObj && typeof originalObj === 'object') {
      const v = originalObj;
      if (token.$description) lines.push(`  /* ${rawKey} — ${token.$description} */`);
      if (v.fontFamily != null) lines.push(`  ${varBase}-font-family: ${v.fontFamily};`);
      if (v.fontSize != null)   lines.push(`  ${varBase}-font-size: ${v.fontSize};`);
      if (v.fontWeight != null) lines.push(`  ${varBase}-font-weight: ${v.fontWeight};`);
      if (v.lineHeight != null) lines.push(`  ${varBase}-line-height: ${v.lineHeight};`);
      if (v.letterSpacing != null) lines.push(`  ${varBase}-letter-spacing: ${v.letterSpacing};`);
    } else if (token.$type === 'iconStyle' && originalObj && typeof originalObj === 'object') {
      // Expand composite iconStyle token into per-property CSS vars.
      // Reference values like {semantic.icon.size.md} become var(--ds-...) references.
      function iconRef(val) {
        if (typeof val === 'string' && /^\{[^}]+\}$/.test(val)) {
          return `var(--ds-${val.replace(/^\{|\}$/g, '').replace(/\./g, '-')})`;
        }
        return val;
      }
      const v = originalObj;
      if (token.$description) lines.push(`  /* ${rawKey} — ${token.$description} */`);
      if (v.size        != null) lines.push(`  ${varBase}-size: ${iconRef(v.size)};`);
      if (v.weight      != null) lines.push(`  ${varBase}-weight: ${iconRef(v.weight)};`);
      if (v.strokeWidth != null) lines.push(`  ${varBase}-stroke-width: ${iconRef(v.strokeWidth)};`);
      if (v.fill        != null) lines.push(`  ${varBase}-fill: ${iconRef(v.fill)};`);
      if (v.grade       != null) lines.push(`  ${varBase}-grade: ${iconRef(v.grade)};`);
      if (v.opticalSize != null) lines.push(`  ${varBase}-optical-size: ${iconRef(v.opticalSize)};`);
    } else if (token.$type === 'transition' && resolvedVal && typeof resolvedVal === 'object') {
      // Compose CSS transition shorthand from resolved duration, timingFunction, delay
      const duration = resolvedVal.duration ?? '0ms';
      const timingFunction = Array.isArray(resolvedVal.timingFunction)
        ? `cubic-bezier(${resolvedVal.timingFunction.join(', ')})`
        : resolvedVal.timingFunction ?? 'ease';
      const delay = resolvedVal.delay ?? '0ms';
      lines.push(`  ${varBase}: ${duration} ${timingFunction} ${delay};${desc}`);
    } else {
      // Output var() reference if original was a pure {reference}, else resolved value
      const isRef = typeof originalVal === 'string' && /^\{[^}]+\}$/.test(originalVal);
      const outputVal = isRef
        ? `var(--ds-${originalVal.replace(/^\{|\}$/g, '').replace(/\./g, '-')})`
        : (Array.isArray(resolvedVal) ? resolvedVal.join(', ') : String(resolvedVal));
      lines.push(`  ${varBase}: ${outputVal};${desc}`);
    }
  }

  lines.push('}');
  return lines.join('\n') + '\n';
}

/**
 * Custom formatter: outputs a CJS module with token values
 * organized for direct use in tailwind.config.js `theme.extend`.
 *
 * Style Dictionary v4 (DTCG mode) exposes tokens with:
 *   token.$value  — the resolved value
 *   token.$type   — the token type
 *   token.key     — full dotted path in braces, e.g. "{primitive.color.brand.500}"
 */
function tailwindFormatter({ dictionary }) {
  const colors    = {};
  const spacing   = {};
  const fontSize  = {};
  const fontWeight = {};
  const lineHeight = {};
  const letterSpacing = {};
  const borderRadius = {};
  const borderWidth = {};
  const boxShadow  = {};
  const fontFamily = {};
  const opacity   = {};
  const transitionDuration = {};
  const transitionTimingFunction = {};

  // Helper: derive kebab-case CSS variable name from a token key
  // e.g. "{semantic.color.text.default}" → "--ds-semantic-color-text-default"
  function toCssVar(key) {
    const path = key.replace(/^\{|\}$/g, '').replace(/\./g, '-');
    return `var(--ds-${path})`;
  }

  for (const token of dictionary.allTokens) {
    // SD v4 DTCG: use $value and key
    const value = token.$value ?? token.value;
    const rawKey = token.key ?? '';
    const path = rawKey.replace(/^\{|\}$/g, '').split('.');
    const layer = path[0];

    if (layer === 'primitive') {
      const category = path[1];
      if (category === 'color') {
        // e.g. primitive.color.brand.500 → colors['brand']['500']
        const [, , group, ...rest] = path;
        if (!group) continue;
        if (!colors[group]) colors[group] = {};
        if (rest.length === 0) {
          colors[group] = value;
        } else {
          colors[group][rest.join('-')] = value;
        }
      }
      if (category === 'spacing') {
        const k = path[2].replace('-', '.'); // '0-5' → '0.5'
        spacing[k] = value;
      }
      if (category === 'typography') {
        const subcat = path[2];
        const k      = path[3];
        if (subcat === 'fontSize')      fontSize[k]      = value;
        if (subcat === 'fontWeight')    fontWeight[k]    = String(value);
        if (subcat === 'lineHeight')    lineHeight[k]    = String(value);
        if (subcat === 'letterSpacing') letterSpacing[k] = value;
        if (subcat === 'fontFamily')    fontFamily[k]    = value;
      }
      if (category === 'borderRadius') {
        const k = path[2];
        borderRadius[k === 'default' ? 'DEFAULT' : k] = value;
      }
      if (category === 'borderWidth') {
        borderWidth[path[2]] = value;
      }
      if (category === 'shadow') {
        const key = path[2];
        boxShadow[key === 'default' ? 'DEFAULT' : key] = value;
      }
      if (category === 'opacity') {
        opacity[path[2]] = value;
      }
      if (category === 'duration') {
        transitionDuration[path[2]] = value;
      }
      if (category === 'cubicBezier') {
        transitionTimingFunction[path[2]] = value;
      }
    }

    // Semantic colors as CSS-variable references for Tailwind
    // e.g. semantic.color.text.default → colors['ds-text-default'] = 'var(--ds-semantic-color-text-default)'
    if (layer === 'semantic' && path[1] === 'color') {
      const twKey  = path.slice(2).join('-');           // text-default, background-subtle
      const cssVar = toCssVar(rawKey);                  // var(--ds-semantic-color-text-default)
      colors[`ds-${twKey}`] = cssVar;
    }
  }

  return `/* Auto-generated by dsm build. Do not edit manually. */
/* Usage: const dsTokens = require('./design-system/build/tailwind.tokens.cjs')  */
/*        then spread into tailwind.config.js theme.extend                       */

module.exports = {
  colors: ${JSON.stringify(colors, null, 2)},
  spacing: ${JSON.stringify(spacing, null, 2)},
  fontSize: ${JSON.stringify(fontSize, null, 2)},
  fontWeight: ${JSON.stringify(fontWeight, null, 2)},
  lineHeight: ${JSON.stringify(lineHeight, null, 2)},
  letterSpacing: ${JSON.stringify(letterSpacing, null, 2)},
  borderRadius: ${JSON.stringify(borderRadius, null, 2)},
  borderWidth: ${JSON.stringify(borderWidth, null, 2)},
  boxShadow: ${JSON.stringify(boxShadow, null, 2)},
  fontFamily: ${JSON.stringify(fontFamily, null, 2)},
  opacity: ${JSON.stringify(opacity, null, 2)},
  transitionDuration: ${JSON.stringify(transitionDuration, null, 2)},
  transitionTimingFunction: ${JSON.stringify(transitionTimingFunction, null, 2)},
};
`;
}

export default {
  // Source: single DTCG tokens file
  source: [resolve(__dirname, 'tokens.json')],

  // Tell Style Dictionary this is W3C DTCG format
  preprocessors: ['tokens-studio'],

  platforms: {
    // ── 1. CSS Custom Properties ────────────────────────────────────────────
    css: {
      transformGroup: 'css',
      prefix: 'ds',
      buildPath: resolve(__dirname, 'build') + '/',
      files: [
        {
          destination: 'css-vars.css',
          format: 'custom/ds-variables',
          options: { selector: ':root' },
        },
      ],
    },

    // ── 2. ES Module (raw token values) ────────────────────────────────────
    js: {
      transformGroup: 'js',
      buildPath: resolve(__dirname, 'build') + '/',
      files: [
        {
          destination: 'tokens.js',
          format: 'javascript/es6',
        },
      ],
    },

    // ── 3. Tailwind Config Extension ───────────────────────────────────────
    tailwind: {
      transformGroup: 'js',
      buildPath: resolve(__dirname, 'build') + '/',
      files: [
        {
          destination: 'tailwind.tokens.cjs',
          format: 'custom/tailwind',
        },
      ],
    },
  },
};

// Register custom Tailwind format
// (Style Dictionary v4 requires registering via the SD instance,
//  so we export a setup function that build.js calls before buildAllPlatforms)
export function registerFormats(sd) {
  sd.registerFormat({
    name: 'custom/ds-variables',
    format: dsVariablesFormatter,
  });
  sd.registerFormat({
    name: 'custom/tailwind',
    format: tailwindFormatter,
  });
}
