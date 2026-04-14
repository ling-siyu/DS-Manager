Tokenize hardcoded values in a file or component, replacing them with design system token CSS variables.

## What this command does

You are a design system enforcer. Your job is to scan the target file for any hardcoded visual values and replace them with the correct design token CSS variable or Tailwind semantic class.

## Instructions

1. **Read the file** specified by the user (or the currently open file if none is given).

2. **Read `design-system/context.md`** to understand the available tokens and their CSS variable names.

3. **Scan for violations** — find all instances of:
   - Hardcoded hex colors: `#fff`, `#3b82f6`, etc.
   - Hardcoded `rgb()` / `rgba()` / `hsl()` values
   - Arbitrary Tailwind color classes: `bg-[#xxx]`, `text-[#xxx]`
   - Arbitrary Tailwind spacing/size classes: `p-[12px]`, `text-[14px]`
   - Inline `style={{ color: '...' }}` with raw values

4. **For each violation**, find the best matching semantic token:
   - Check `design-system/context.md` semantic color table first
   - Match by intent: error states → `--ds-semantic-color-status-error-*`, primary buttons → `--ds-semantic-color-interactive-primary-*`, body text → `--ds-semantic-color-text-default`, etc.
   - If the hardcoded value matches a primitive exactly, prefer the semantic token that maps to it over the raw primitive

5. **Apply replacements**:
   - For CSS/SCSS: replace with `var(--ds-semantic-color-text-default)` pattern
   - For Tailwind classes: use the `ds-*` extended classes if configured, or convert to a CSS variable via `style` prop + `var()`
   - For inline styles: convert to className using the closest Tailwind/CSS-var equivalent

6. **If no match exists** for a value: add a comment `/* TODO: add token for <value> */` and leave the value unchanged. List these at the end of your response so the developer can add new tokens.

7. **Show a summary** of every replacement made and any unmatched values.

## Example

Before:
```tsx
<div style={{ color: '#171717', background: '#fafafa' }}>
  <button className="bg-[#4f46e5] text-white p-[12px]">Submit</button>
</div>
```

After:
```tsx
<div style={{ color: 'var(--ds-semantic-color-text-default)', background: 'var(--ds-semantic-color-background-subtle)' }}>
  <button className="bg-[var(--ds-semantic-color-interactive-primary-bg)] text-white p-3">Submit</button>
</div>
```

## Important

- Never remove functionality, only change visual values
- Preserve all logic, event handlers, and structural code exactly
- If you are unsure about a token match, choose the closest semantic intent and note your reasoning
