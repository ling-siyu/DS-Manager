import type { PreviewComponent, PreviewPropMeta } from '../types';

// Auto-discovered components carry no authored preview values, yet most have
// REQUIRED props — render them with `undefined` and they show empty, render
// NaN, or crash (e.g. `.map()` over an undefined array). We synthesize sensible
// placeholders from each prop's metadata so a component renders meaningfully out
// of the box. This runs CLIENT-SIDE on purpose: functions / Set / Map can't
// survive the JSON virtual-data module, so they're reconstructed here from the
// serialized { type, options, required } metadata.

const NOOP = () => undefined;

/** Humanize a prop name into display text: `firstName` → "First Name". */
function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .trim();
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Strip the surrounding quotes TS union members carry, e.g. `"'md'"` → `md`. */
function unquote(s: string): string {
  return s.replace(/^['"]|['"]$/g, '');
}

/** Best-effort placeholder for one required prop, or undefined when no safe
 *  value exists (complex domain objects — let the error boundary handle those). */
function placeholderFor(name: string, meta: PreviewPropMeta): unknown {
  // A finite option set (enum / string union) → pick the first member.
  if (meta.options && meta.options.length) return unquote(meta.options[0]);

  const t = (meta.type ?? '').trim();
  const lower = t.toLowerCase();

  // Callbacks: no-op so the component wires up without crashing.
  if (t.includes('=>') || lower.includes('function')) return NOOP;

  if (lower === 'boolean') return false;

  if (lower === 'number' || lower === 'string | number' || lower === 'number | string') {
    // Dimensions need a visible magnitude; everything else can be 0.
    return /(width|height|size|radius|count|length|index|px|offset|gap|spacing)/i.test(name) ? 64 : 0;
  }

  if (lower === 'string') return humanize(name);

  // Renderable content.
  if (lower.includes('reactnode') || lower.includes('react.node') || lower.includes('element')) {
    return humanize(name);
  }

  // Collections: an empty instance is crash-safe (map/forEach/has all no-op).
  if (/\[\]$/.test(t) || lower.startsWith('array<') || lower.startsWith('readonlyarray<')) return [];
  if (lower.startsWith('set<') || lower.startsWith('readonlyset<')) return new Set();
  if (lower.startsWith('map<') || lower.startsWith('readonlymap<')) return new Map();

  // Unknown / complex object shapes: no safe synthesis.
  return undefined;
}

/** Placeholder props for a component's REQUIRED props. Authored previewProps /
 *  scenario props should be spread AFTER these so explicit values always win. */
export function synthesizeProps(component: PreviewComponent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, meta] of Object.entries(component.props ?? {})) {
    if (!meta.required) continue;
    const value = placeholderFor(name, meta);
    if (value !== undefined) out[name] = value;
  }
  return out;
}
