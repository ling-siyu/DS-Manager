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
    <article class="summary-card">
      <span class="summary-label">${escapeHTML(label)}</span>
      <span class="summary-value">${escapeHTML(value)}</span>
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
      <span class="level-label">
        <span>${escapeHTML(level.label)}</span>
        <span class="level-count">${level.count}</span>
      </span>
      <span class="level-name">${escapeHTML(level.title)}</span>
      <span class="helper">${escapeHTML(level.count)} ${escapeHTML(level.itemLabel)}</span>
    </button>
  `).join('');
}

export function renderLevelOverviewCard(level) {
  const summary = level.numericLevel === 0
    ? `${level.count} tokens across foundation categories`
    : `${level.count} component${level.count === 1 ? '' : 's'} in this layer`;

  return `
    <button
      class="nav-card"
      type="button"
      data-route="${escapeHTML(JSON.stringify({ name: 'level', levelId: level.id }))}"
      data-filter-item="level"
      data-query="${escapeHTML(`${level.label} ${level.title} ${level.description} ${summary}`.toLowerCase())}"
    >
      <div class="component-top">
        <div>
          <p class="helper">${escapeHTML(level.label)}</p>
          <h3 class="component-name">${escapeHTML(level.title)}</h3>
        </div>
        <span class="level-chip">${escapeHTML(level.count)} ${escapeHTML(level.itemLabel)}</span>
      </div>
      <p class="section-copy">${escapeHTML(level.description)}</p>
      <div class="chip-row">
        <span class="chip">${escapeHTML(summary)}</span>
        <span class="chip">Open list</span>
      </div>
    </button>
  `;
}

export function renderTokenGroupCard(group) {
  return `
    <button
      class="nav-card"
      type="button"
      data-route="${escapeHTML(JSON.stringify({ name: 'token-group', groupId: group.id }))}"
      data-filter-item="token-group"
      data-query="${escapeHTML(`${group.title} ${group.description} ${group.entries.length}`.toLowerCase())}"
    >
      <div class="component-top">
        <div>
          <p class="helper">Token type</p>
          <h3 class="component-name">${escapeHTML(group.title)}</h3>
        </div>
        <span class="level-chip">${group.entries.length}</span>
      </div>
      <p class="section-copy">${escapeHTML(group.description)}</p>
      <div class="chip-row">
        <span class="chip">${group.entries.length} token${group.entries.length === 1 ? '' : 's'}</span>
        <span class="chip">View details</span>
      </div>
    </button>
  `;
}

export function renderTokenCard(path, token, groupId) {
  const value = formatValue(token.resolvedValue);
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
          <span>${escapeHTML(path.split('.').pop())}</span>
          <span>${escapeHTML(value)}</span>
        </div>
        <p class="token-name">${escapeHTML(path)}</p>
        <p class="token-var mono">${escapeHTML(token.cssVar)}</p>
      </button>
    `;
  }

  if (groupId === 'spacing') {
    return `
      <button class="spacing-card" type="button" ${tokenButtonAttributes(path, token)} data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
        <div class="spacing-bar" style="width:clamp(var(--ds-primitive-spacing-1), ${escapeHTML(value)}, var(--ui-spacing-bar-max-width))"></div>
        <p class="token-name">${escapeHTML(path)}</p>
        <p class="token-value">${escapeHTML(value)}</p>
        <p class="token-var mono">${escapeHTML(token.cssVar)}</p>
      </button>
    `;
  }

  if (groupId === 'shadows') {
    return `
      <button class="shadow-card" type="button" ${tokenButtonAttributes(path, token)} data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
        <div class="shadow-preview" style="box-shadow:${escapeHTML(value)}"></div>
        <p class="token-name">${escapeHTML(path)}</p>
        <p class="token-value">${escapeHTML(value)}</p>
        <p class="token-var mono">${escapeHTML(token.cssVar)}</p>
      </button>
    `;
  }

  if (groupId === 'typography') {
    const fontSize = token.$type === 'fontSize' ? escapeHTML(value) : 'var(--ds-primitive-typography-font-size-xl)';
    const fontWeight = token.$type === 'fontWeight' ? escapeHTML(value) : 'var(--ds-primitive-typography-font-weight-medium)';

    return `
      <button class="specimen-card" type="button" ${tokenButtonAttributes(path, token)} data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
        <p class="specimen" style="font-size:${fontSize};font-weight:${fontWeight}">The quick brown fox jumps over the lazy dog.</p>
        <p class="token-name">${escapeHTML(path)}</p>
        <p class="token-value">${escapeHTML(value)}</p>
        <p class="token-var mono">${escapeHTML(token.cssVar)}</p>
      </button>
    `;
  }

  return `
    <button class="nav-card" type="button" ${tokenButtonAttributes(path, token)} data-route="${escapeHTML(JSON.stringify(tokenRoute))}">
      <div>
        <p class="helper">${escapeHTML(token.$type || 'token')}</p>
        <h3 class="component-name">${escapeHTML(path)}</h3>
      </div>
      <p class="token-value">${escapeHTML(value)}</p>
      <p class="token-var mono">${escapeHTML(token.cssVar)}</p>
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
        <div>
          <h3 class="component-name">${escapeHTML(component.name)}</h3>
          <p class="helper mono">${escapeHTML(component.path)}</p>
        </div>
        ${renderStatusPill(component.status || 'stable')}
      </div>
      <div class="chip-row">
        <span class="level-chip">${escapeHTML(component.levelLabel)}</span>
        <span class="chip">${component.preview?.available ? 'React preview' : 'Metadata preview'}</span>
        <span class="chip">${(component.contains || []).length ? `${component.contains.length} child assets` : 'Leaf component'}</span>
      </div>
      <p class="section-copy">${escapeHTML(component.description || 'No description provided.')}</p>
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
  const slotCount = Array.isArray(preview.previewSlots) ? preview.previewSlots.length : 0;

  return `
    <article class="group-card preview-panel">
      <div class="group-head">
        <div>
          <h3 class="group-title">Preview</h3>
          <p class="helper">Live React rendering is isolated in an iframe so app providers and styles do not leak into the DSM shell.</p>
        </div>
        <span class="status-pill" data-status="${escapeHTML(preview.mode === 'react' ? 'ready' : 'metadata')}">
          <span class="status-dot"></span>
          ${escapeHTML(preview.mode === 'react' ? 'React preview' : 'Metadata fallback')}
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
            <p class="helper">${escapeHTML(preview.reason || 'Preview adapter is not available for this component.')}</p>
          </div>
        `}
      <div class="chip-row">
        <span class="chip">${escapeHTML(previewSummary.mode === 'react' ? 'Adapter detected' : 'No adapter configured')}</span>
        <span class="chip">${scenarioCount ? `${scenarioCount} scenario${scenarioCount === 1 ? '' : 's'}` : 'Default props only'}</span>
        <span class="chip">${slotCount ? `${slotCount} slot${slotCount === 1 ? '' : 's'}` : 'No slot metadata'}</span>
      </div>
      ${notes.length ? `
        <div class="preview-notes">
          ${notes.map((note) => `<p class="helper">${escapeHTML(note)}</p>`).join('')}
        </div>
      ` : ''}
      ${diagnostics.length ? `
        <div class="preview-diagnostics">
          <p class="helper preview-diagnostics-title">Diagnostics</p>
          <ul class="preview-diagnostics-list">
            ${diagnostics.map((message) => `<li>${escapeHTML(message)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </article>
  `;
}

export function renderTokenDetailPreview(groupId, entry) {
  const [path, token] = entry;
  const value = formatValue(token.resolvedValue);
  const isColor = groupId === 'colors' || isColorToken(entry);
  const isShadow = groupId === 'shadows' || isShadowToken(entry);
  const previewStyle = isColor
    ? `background:${escapeHTML(value)};color:${labelColorForBackground(value)};`
    : isShadow
      ? `box-shadow:${escapeHTML(value)};`
      : '';

  return `
    <div class="token-detail-preview ${normalize(value) === 'transparent' ? 'transparent' : ''}" style="${previewStyle}">
      <strong>${escapeHTML(path)}</strong>
      <span>${escapeHTML(value)}</span>
    </div>
  `;
}
