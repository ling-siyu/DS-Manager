import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

/**
 * Compile the project's REAL global stylesheet (src/index.css) so its components
 * render with full fidelity inside the preview — exactly what the app (and its
 * Storybook) ship. Because the preview now renders each component in an isolated
 * iframe, we deliberately include EVERYTHING: Tailwind preflight, the project's
 * `@theme`, `@layer base` globals (resets, base typography, the radius/shadow
 * rules), `@layer utilities`, keyframes, and `:root` custom properties. None of
 * it can leak into the DSM chrome — it lives in the iframe document.
 *
 * Tailwind 4 resolves `@import "tailwindcss"`, `@config`, and content scanning
 * relative to the CSS file, so the compiled output matches the app's own Vite
 * build. Returns '' when the project has no src/index.css (callers fall back to
 * buildSecuramarkCss for a synthesized utilities-only sheet).
 */
export async function buildProjectCss({ projectDir }) {
  if (!projectDir || !existsSync(projectDir)) return '';

  // Prefer the conventional global entry; fall back to other common names.
  const candidates = ['src/index.css', 'src/styles.css', 'src/global.css', 'src/app.css'];
  const entry = candidates.map((p) => resolve(projectDir, p)).find((p) => existsSync(p));
  if (!entry) return '';

  const css = readFileSync(entry, 'utf8');
  // `from` inside the project so @import/@config/url() + content scanning resolve
  // exactly as the app's own build does.
  const result = await postcss([tailwindcss()]).process(css, { from: entry });
  return result.css;
}

/**
 * Fallback: synthesize a utilities-only sheet from the captured DTCG tokens when
 * the project has no global stylesheet to compile. Emits Tailwind 4 utilities +
 * theme but DELIBERATELY skips preflight so it stays inert outside rendered
 * components (used only when buildProjectCss returns '').
 *
 * - Colors come from the captured DTCG (`@theme { --color-* }` + `[data-theme=light]`).
 * - Type / radius / motion scales come from the project's tailwind.config.js via `@config`.
 * - `source()` points Tailwind's content scan at the components so only used classes emit.
 */
export async function buildSecuramarkCss({ securamarkDir, tokensPath }) {
  if (!securamarkDir || !existsSync(securamarkDir)) return '';

  const configPath = resolve(securamarkDir, 'tailwind.config.js');
  const componentsDir = resolve(securamarkDir, 'src/components');

  const dark = [];
  const light = [];
  try {
    const raw = JSON.parse(readFileSync(tokensPath, 'utf8'));
    for (const [key, token] of Object.entries(raw.color ?? {})) {
      if (token?.$value) dark.push(`  --color-${key}: ${token.$value};`);
      const themeLight = token?.$extensions?.['com.securamark']?.themeLight;
      if (themeLight) light.push(`  --color-${key}: ${themeLight};`);
    }
  } catch {
    // No capture → utilities still compile, colors fall back to config/defaults.
  }

  const source = [
    '@layer theme, utilities;',
    '@import "tailwindcss/theme";',
    `@import "tailwindcss/utilities" source(${JSON.stringify(componentsDir)});`,
    existsSync(configPath) ? `@config ${JSON.stringify(configPath)};` : '',
    dark.length ? `@theme {\n${dark.join('\n')}\n}` : '',
    light.length ? `[data-theme="light"] {\n${light.join('\n')}\n}` : '',
  ].filter(Boolean).join('\n');

  const result = await postcss([tailwindcss()]).process(source, {
    from: resolve(securamarkDir, 'src/index.css'),
  });
  return result.css;
}
