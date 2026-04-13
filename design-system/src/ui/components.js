import {
  escapeHTML,
  formatValue,
  isColorToken,
  isShadowToken,
  labelColorForBackground,
  normalize,
  sentenceCase,
} from './utils.js';

function tokenButtonAttributes(path, token) {
  const query = `${path} ${token.cssVar} ${token.$type || ''} ${formatValue(token.resolvedValue)}`;
  return `data-filter-item="token" data-query="${escapeHTML(query.toLowerCase())}" data-copy="${escapeHTML(token.cssVar)}"`;
}

function componentAttributes(component) {
  const query = [
    component.name,
    component.description,
    component.path,
    component.levelLabel,
    (component.variants || []).join(' '),
    (component.contains || []).join(' '),
    component.status,
    Object.keys(component.props || {}).join(' '),
  ].join(' ');

  return `data-filter-item="component" data-query="${escapeHTML(query.toLowerCase())}" data-copy="${escapeHTML(component.path)}"`;
}

export function renderEmpty(message) {
  return `<p class="empty-state">${escapeHTML(message)}</p>`;
}

export function renderStatusPill(status = 'stable') {
  return `
    <span class="status-pill" data-status="${escapeHTML(status)}">
      <span class="status-dot"></span>
      ${escapeHTML(sentenceCase(status))}
    </span>
  `;
}

export function renderSummaryCard(label, value) {
  return `
    <article class="detail-card">
      <span class="detail-label">${escapeHTML(label)}</span>
      <span class="token-short-name">${escapeHTML(value)}</span>
    </article>
  `;
}

export function renderDetailCard(label, value, mono = false) {
  return `
    <article class="detail-card">
      <span class="detail-label">${escapeHTML(label)}</span>
      <p class="detail-value ${mono ? 'mono' : ''}">${escapeHTML(value)}</p>
    </article>
  `;
}

export function renderBreadcrumbs(items) {
  return `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      ${items.map((item, index) => item.route ? `
        <button class="crumb-button" type="button" data-route="${escapeHTML(JSON.stringify(item.route))}">${escapeHTML(item.label)}</button>
        ${index < items.length - 1 ? '<span class="breadcrumb-separator">/</span>' : ''}
      ` : `
        <span aria-current="page">${escapeHTML(item.label)}</span>
        ${index < items.length - 1 ? '<span class="breadcrumb-separator">/</span>' : ''}
      `).join('')}
    </nav>
  `;
}

export function renderPropsTable(props) {
  const entries = Object.entries(props || {});
  if (entries.length === 0) return '<p class="helper">No prop metadata.</p>';

  return `
    <table class="props-table">
      <thead>
        <tr>
          <th>Prop</th>
          <th>Type</th>
          <th>Default</th>
          <th>Required</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(([name, config]) => `
          <tr>
            <td class="mono">${escapeHTML(name)}</td>
            <td>${escapeHTML(formatValue(config.type))}</td>
            <td>${escapeHTML(formatValue(config.default))}</td>
            <td>${config.required ? 'Yes' : 'No'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

export function renderLevelNav(levels, activeLevelId) {
  return levels.map((level) => `
    <button
      class="level-link ${level.id === activeLevelId ? 'is-active' : ''}"
      type="button"
      data-route="${escapeHTML(JSON.stringify({ name: 'level', levelId: level.id }))}"
      aria-current="${level.id === activeLevelId ? 'page' : 'false'}"
    >
      <span class="level-label">${escapeHTML(level.label)}</span>
      <span class="level-name">${escapeHTML(level.title)}</span>
    </button>
  `).join('');
}

export function renderLevelOverviewCard(level) {
  return `
    <button
      class="nav-card"
      type="button"
      data-route="${escapeHTML(JSON.stringify({ name: 'level', levelId: level.id }))}"
      data-filter-item="level"
      data-query="${escapeHTML(`${level.label} ${level.title} ${level.description}`.toLowerCase())}"
    >
      <div class="component-top">
        <div>
          <p class="helper">${escapeHTML(level.label)}</p>
          <h3 class="component-name">${escapeHTML(level.title)}</h3>
        </div>
      </div>
    </button>
  `;
}

function renderGroupPreview(group) {
  if (group.id === 'colors') {
    const swatches = group.entries.slice(0, 7).map(([, token]) => {
      const value = formatValue(token.resolvedValue);
      const isTransparent = normalize(value) === 'transparent';
      return `<span class="mini-swatch ${isTransparent ? 'transparent' : ''}" style="${isTransparent ? '' : `background:${escapeHTML(value)};`}"></span>`;
    }).join('');
    return `<div class="group-preview">${swatches}</div>`;
  }

  if (group.id === 'spacing') {
    const heights = [8, 16, 24, 36, 48];
    const bars = heights.map((h) => `<span class="mini-spacing-bar" style="height:${h}px;"></span>`).join('');
    return `<div class="group-preview"><div class="mini-spacing-bars">${bars}</div></div>`;
  }

  if (group.id === 'typography') {
    return `
      <div class="group-preview" style="flex-direction:column;align-items:flex-start;justify-content:center;padding:var(--ui-space-3) var(--ui-space-4);gap:3px">
        <span style="font-size:22px;font-weight:700;line-height:1;color:var(--ui-text);letter-spacing:-0.02em">Heading</span>
        <span style="font-size:13px;font-weight:400;line-height:1.4;color:var(--ui-text-subtle)">Body text reads like this</span>
        <span style="font-size:10px;font-weight:500;line-height:1;color:var(--ui-text-muted);letter-spacing:0.06em;text-transform:uppercase">LABEL · CAPTION</span>
      </div>
    `;
  }

  if (group.id === 'shadows') {
    return `<div class="group-preview"><div class="mini-shadow-box"></div></div>`;
  }

  // 'all' or fallback — mixed dot grid using brand color shades
  const dotColors = [
    'var(--ds-primitive-color-brand-300)',
    'var(--ds-primitive-color-brand-500)',
    'var(--ds-primitive-color-brand-700)',
    'var(--ds-primitive-color-neutral-200)',
    'var(--ds-primitive-color-neutral-400)',
    'var(--ds-primitive-color-neutral-600)',
  ];
  const dots = dotColors.map((c) => `<span class="mini-grid-dot" style="background:${c};"></span>`).join('');
  return `<div class="group-preview"><div class="mini-grid">${dots}</div></div>`;
}

export function renderTokenGroupCard(group) {
  return `
    <button
      class="nav-card"
      type="button"
      data-route="${escapeHTML(JSON.stringify({ name: 'token-group', groupId: group.id }))}"
      data-filter-item="token-group"
      data-query="${escapeHTML(`${group.title} ${group.description}`.toLowerCase())}"
    >
      ${renderGroupPreview(group)}
      <div>
        <h3 class="component-name">${escapeHTML(group.title)}</h3>
        <p class="helper" style="margin-top:2px">${escapeHTML(group.description)}</p>
      </div>
    </button>
  `;
}

export function renderTokenCard(path, token, groupId) {
  const value = formatValue(token.resolvedValue);
  const shortName = path.split('.').pop();
  const tokenRoute = { name: 'token', groupId, tokenPath: path };

  if (groupId === 'colors') {
    const transparent = normalize(value) === 'transparent';
    const textColor = labelColorForBackground(value);
    const style = transparent
      ? `color:${textColor};`
      : `background:${escapeHTML(value)};color:${textColor};`;

    return `
      <button class="swatch" type="button" ${tokenButtonAttributes(path, token)} data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
        <div class="swatch-preview ${transparent ? 'transparent' : ''}" style="${style}">
          <span>${escapeHTML(shortName)}</span>
        </div>
        <p class="token-short-name">${escapeHTML(shortName)}</p>
        <p class="token-full-path">${escapeHTML(path)}</p>
      </button>
    `;
  }

  if (groupId === 'spacing') {
    return `
      <button class="spacing-row" type="button" ${tokenButtonAttributes(path, token)} data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
        <div class="spacing-row-bar-wrap" aria-hidden="true">
          <div class="spacing-row-bar" style="width:min(${escapeHTML(value)}, 100%)"></div>
        </div>
        <span class="spacing-row-name">${escapeHTML(shortName)}</span>
        <span class="spacing-row-path mono">${escapeHTML(path)}</span>
        <span class="spacing-row-value mono">${escapeHTML(value)}</span>
      </button>
    `;
  }

  if (groupId === 'shadows') {
    return `
      <button class="shadow-card" type="button" ${tokenButtonAttributes(path, token)} data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
        <div class="shadow-preview" style="box-shadow:${escapeHTML(value)}"></div>
        <p class="token-short-name">${escapeHTML(shortName)}</p>
        <p class="token-full-path">${escapeHTML(path)}</p>
      </button>
    `;
  }

  if (groupId === 'typography') {
    const fontSize = token.$type === 'fontSize' ? escapeHTML(value) : 'var(--ds-primitive-typography-font-size-xl)';
    const fontWeight = token.$type === 'fontWeight' ? escapeHTML(value) : 'var(--ds-primitive-typography-font-weight-medium)';

    return `
      <button class="specimen-card" type="button" ${tokenButtonAttributes(path, token)} data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
        <p class="specimen" style="font-size:${fontSize};font-weight:${fontWeight}">Ag</p>
        <p class="token-short-name">${escapeHTML(shortName)}</p>
        <p class="token-full-path">${escapeHTML(path)}</p>
        <p class="token-value">${escapeHTML(value)}</p>
      </button>
    `;
  }

  return `
    <button class="nav-card" type="button" ${tokenButtonAttributes(path, token)} data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
      <div>
        <p class="helper">${escapeHTML(token.$type || 'token')}</p>
        <h3 class="token-short-name">${escapeHTML(shortName)}</h3>
      </div>
      <p class="token-full-path">${escapeHTML(path)}</p>
      <p class="token-value">${escapeHTML(value)}</p>
    </button>
  `;
}

export function renderComponentCard(component, levelId) {
  return `
    <button
      class="component-card"
      type="button"
      ${componentAttributes(component)}
      data-route="${escapeHTML(JSON.stringify({ name: 'component', levelId, componentName: component.name }))}"
    >
      <div class="component-top">
        <h3 class="component-name">${escapeHTML(component.name)}</h3>
        ${renderStatusPill(component.status || 'stable')}
      </div>
      <p class="helper">${escapeHTML(component.description || 'No description provided.')}</p>
      ${(component.variants || []).length ? `
        <div class="chip-row">
          ${(component.variants || []).slice(0, 4).map((variant) => `<span class="chip">${escapeHTML(variant)}</span>`).join('')}
        </div>
      ` : ''}
    </button>
  `;
}

export function renderComponentPreviewPanel(component, previewSummary) {
  const preview = component.preview || {};
  const diagnostics = [
    ...(previewSummary.warnings || []),
    ...(previewSummary.errors || []),
    ...(preview.errors || []),
  ];
  const notes = [
    preview.previewNotes || '',
    preview.reason || '',
  ].filter(Boolean);

  const scenarioCount = Array.isArray(preview.previewScenarios) ? preview.previewScenarios.length : 0;

  return `
    <article class="group-card preview-panel">
      <div class="group-head">
        <h3 class="group-title">Preview</h3>
        <span class="status-pill" data-status="${escapeHTML(preview.mode === 'react' ? 'stable' : 'beta')}">
          <span class="status-dot"></span>
          ${escapeHTML(preview.mode === 'react' ? 'React' : 'Metadata')}
        </span>
      </div>
      ${preview.mode === 'react'
        ? `
          <iframe
            class="preview-frame"
            title="${escapeHTML(component.name)} live preview"
            src="${escapeHTML(preview.iframePath)}"
            loading="lazy"
          ></iframe>
        `
        : `
          <div class="preview-fallback">
            <p class="helper">${escapeHTML(preview.reason || 'No preview adapter available for this component.')}</p>
          </div>
        `}
      ${scenarioCount ? `<div class="chip-row"><span class="chip">${scenarioCount} scenario${scenarioCount === 1 ? '' : 's'}</span></div>` : ''}
      ${notes.length ? `
        <div class="preview-notes">
          ${notes.map((note) => `<p class="helper">${escapeHTML(note)}</p>`).join('')}
        </div>
      ` : ''}
      ${diagnostics.length ? `
        <div class="preview-diagnostics">
          <p class="preview-diagnostics-title">Diagnostics</p>
          <ul class="preview-diagnostics-list">
            ${diagnostics.map((message) => `<li>${escapeHTML(message)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </article>
  `;
}

export function renderCompactSwatch(path, token, groupId) {
  const value = formatValue(token.resolvedValue);
  const shortName = path.split('.').pop();
  const transparent = normalize(value) === 'transparent';
  const tokenRoute = { name: 'token', groupId, tokenPath: path };

  return `
    <button class="compact-swatch" type="button"
      ${tokenButtonAttributes(path, token)}
      data-route="${escapeHTML(JSON.stringify(tokenRoute))}"
      title="${escapeHTML(path)}: ${escapeHTML(value)}">
      <div class="compact-swatch-color ${transparent ? 'transparent' : ''}"${transparent ? '' : ` style="background:${escapeHTML(value)};"`}></div>
      <span class="compact-swatch-label">${escapeHTML(shortName)}</span>
    </button>
  `;
}

export function renderTypographyRow(path, token, groupId) {
  const val = token.$value ?? {};
  const roleName = path.split('.').slice(2).join('.'); // semantic.typography.body.base → body.base
  const tokenRoute = { name: 'token', groupId, tokenPath: path };
  const query = `${path} ${token.cssVar ?? ''} typography ${roleName} ${val.fontSize ?? ''} ${val.fontWeight ?? ''}`;

  const previewStyle = [
    val.fontFamily ? `font-family:${val.fontFamily}` : '',
    val.fontSize ? `font-size:${val.fontSize}` : '',
    val.fontWeight != null ? `font-weight:${val.fontWeight}` : '',
    val.lineHeight != null ? `line-height:${val.lineHeight}` : '',
    val.letterSpacing ? `letter-spacing:${val.letterSpacing}` : '',
  ].filter(Boolean).join(';');

  return `
    <button class="type-row" type="button"
      data-filter-item="token" data-query="${escapeHTML(query.toLowerCase())}"
      data-copy="${escapeHTML(token.cssVar ?? path)}"
      data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
      <span class="type-preview-text" aria-hidden="true" style="${escapeHTML(previewStyle)}">The quick brown fox jumps over the lazy dog</span>
      <span class="type-row-name">${escapeHTML(roleName)}</span>
      <div class="type-row-meta">
        ${val.fontSize ? `<span class="type-row-prop">${escapeHTML(String(val.fontSize))}</span>` : ''}
        ${val.fontWeight != null ? `<span class="type-row-prop">${escapeHTML(String(val.fontWeight))}</span>` : ''}
        ${val.lineHeight != null ? `<span class="type-row-prop">${escapeHTML(String(val.lineHeight))}</span>` : ''}
      </div>
    </button>
  `;
}

export function renderTokenDetailPreview(groupId, entry) {
  const [, token] = entry;
  const value = formatValue(token.resolvedValue);
  const isColor = groupId === 'colors' || isColorToken(entry);
  const isShadow = groupId === 'shadows' || isShadowToken(entry);

  if (token.$type === 'typography' && token.resolvedValue && typeof token.resolvedValue === 'object') {
    const val = token.resolvedValue;
    const style = [
      val.fontFamily ? `font-family:${val.fontFamily}` : '',
      val.fontSize ? `font-size:${val.fontSize}` : '',
      val.fontWeight != null ? `font-weight:${val.fontWeight}` : '',
      val.lineHeight != null ? `line-height:${val.lineHeight}` : '',
      val.letterSpacing ? `letter-spacing:${val.letterSpacing}` : '',
    ].filter(Boolean).join(';');
    return `
      <div class="token-detail-preview token-detail-preview--typography">
        <p class="type-detail-specimen" style="${escapeHTML(style)}">The quick brown fox jumps over the lazy dog</p>
      </div>
    `;
  }
  const [path] = entry;
  const isSpacing = groupId === 'spacing';

  if (isSpacing) {
    return `
      <div class="token-detail-preview token-detail-preview--spacing">
        <span class="spacing-detail-label">${escapeHTML(value)}</span>
        <div class="spacing-detail-track">
          <div class="spacing-detail-bar" style="width:min(${escapeHTML(value)}, 100%)"></div>
        </div>
      </div>
    `;
  }

  const previewStyle = isColor
    ? `background:${escapeHTML(value)};color:${labelColorForBackground(value)};`
    : isShadow
      ? `box-shadow:${escapeHTML(value)};`
      : '';

  return `
    <div class="token-detail-preview ${normalize(value) === 'transparent' ? 'transparent' : ''}" style="${previewStyle}">
      <strong>${escapeHTML(path.split('.').pop())}</strong>
      <span class="token-full-path" style="text-align:center">${escapeHTML(value)}</span>
    </div>
  `;
}
