export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sentenceCase(value) {
  const text = String(value || '').replace(/[-_]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatValue(value) {
  if (value === undefined || value === null || value === '') return 'n/a';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function normalize(value) {
  return String(value || '').toLowerCase();
}

export function isColorToken([path, token]) {
  return token.$type === 'color' || path.includes('.color.');
}

export function isSpacingToken([path, token]) {
  if (token.$type === 'dimension') return true;
  return /(?:^|\.)(space|spacing|gap|padding|margin|inset|radius|width|height)(?:\.|$)/.test(path);
}

export function isTypographyToken([path, token]) {
  return token.$type === 'fontSize' || token.$type === 'fontWeight' || path.includes('.typography.');
}

export function isShadowToken([path, token]) {
  return token.$type === 'shadow' || path.includes('.shadow.');
}

function hexToRgb(hex) {
  const value = hex.replace('#', '').trim();
  if (value.length !== 3 && value.length !== 6) return null;

  const full = value.length === 3
    ? value.split('').map((part) => part + part).join('')
    : value;

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

export function labelColorForBackground(color) {
  if (normalize(color) === 'transparent') return 'var(--ui-text-contrast-default)';

  const rgb = hexToRgb(String(color));
  if (!rgb) return 'var(--ui-text-contrast-default)';

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45
    ? 'var(--ui-text-contrast-default)'
    : 'var(--ui-text-contrast-inverse)';
}

export async function copyText(value, showToast) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'absolute';
      input.style.left = '-100vw';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }

    showToast(`${value} copied`);
  } catch {
    showToast('Copy failed');
  }
}

export function createToastController(element) {
  let timer = null;

  return {
    show(message) {
      element.textContent = message;
      element.classList.add('is-visible');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => element.classList.remove('is-visible'), 1600);
    },
  };
}
