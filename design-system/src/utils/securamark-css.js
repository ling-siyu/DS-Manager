import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

/**
 * Compile SecuraMark's utility CSS so its real components render styled inside the
 * DSM preview. We emit Tailwind 4 utilities + theme but DELIBERATELY skip preflight
 * (no `@import "tailwindcss"`, just theme + utilities) so SecuraMark's global resets
 * don't clobber the DSM chrome — the chrome uses only custom class names, so the
 * utilities are inert outside the rendered components.
 *
 * - Colors come from the captured DTCG (`@theme { --color-* }` + `[data-theme=light]`),
 *   the same mechanism SecuraMark uses (Tailwind 4 maps `--color-x` → `text-x`/`bg-x`/…).
 * - Type / radius / motion scales come from SecuraMark's own tailwind.config.js via `@config`.
 * - `source()` points Tailwind's content scan at SecuraMark's components so only the
 *   classes they actually use are generated.
 *
 * Returns the compiled CSS string (empty string if SecuraMark isn't available).
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

  // `from` inside SecuraMark so relative resolution in the config behaves.
  const result = await postcss([tailwindcss()]).process(source, {
    from: resolve(securamarkDir, 'src/index.css'),
  });
  return result.css;
}
