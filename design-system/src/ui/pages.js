import {
  renderBreadcrumbs,
  renderCompactSwatch,
  renderComponentCard,
  renderComponentPreviewPanel,
  renderDetailCard,
  renderEmpty,
  renderLevelOverviewCard,
  renderPropsTable,
  renderStatusPill,
  renderTokenCard,
  renderTokenDetailPreview,
  renderTokenGroupCard,
  renderTypographyRow,
} from './components.js';
import { escapeHTML, formatValue } from './utils.js';

function colorFamilyLabel(parentPath) {
  const exclude = new Set(['primitive', 'semantic', 'component', 'color']);
  const meaningful = parentPath.split('.').filter((s) => !exclude.has(s));
  return meaningful.length === 0 ? 'base' : meaningful.join(' / ');
}

function renderColorGroupList(group) {
  if (group.entries.length === 0) return renderEmpty('No colors found.');

  const families = new Map();
  for (const [path, token] of group.entries) {
    const segs = path.split('.');
    const parentKey = segs.slice(0, -1).join('.');
    if (!families.has(parentKey)) families.set(parentKey, []);
    families.get(parentKey).push([path, token]);
  }

  const rows = [...families.entries()].map(([parentKey, entries]) => {
    const label = colorFamilyLabel(parentKey);
    const swatches = entries.map(([p, t]) => renderCompactSwatch(p, t, group.id)).join('');
    return `
      <div class="color-family-row">
        <span class="color-family-label">${escapeHTML(label)}</span>
        <div class="color-family-swatches">${swatches}</div>
      </div>
    `;
  }).join('');

  return `<div class="color-families">${rows}</div>`;
}

function renderTypographyList(group) {
  if (group.entries.length === 0) return renderEmpty('No typography tokens found.');
  const composites = group.entries.filter(([, t]) => t.$type === 'typography');
  const primitives = group.entries.filter(([, t]) => t.$type !== 'typography');
  return `
    ${composites.length ? `<div class="type-list">${composites.map(([path, token]) => renderTypographyRow(path, token, group.id)).join('')}</div>` : ''}
    ${primitives.length ? `<div class="token-grid" style="margin-top:var(--ui-space-4)">${primitives.map(([path, token]) => renderTokenCard(path, token, group.id)).join('')}</div>` : ''}
  `;
}

function renderTokenGroupList(group) {
  if (group.entries.length === 0) return renderEmpty(`No ${group.title.toLowerCase()} found.`);
  if (group.id === 'colors') return renderColorGroupList(group);
  if (group.id === 'spacing') {
    return `<div class="spacing-list">${group.entries.map(([path, token]) => renderTokenCard(path, token, group.id)).join('')}</div>`;
  }
  if (group.id === 'typography') return renderTypographyList(group);
  return `<div class="token-grid">${group.entries.map(([path, token]) => renderTokenCard(path, token, group.id)).join('')}</div>`;
}

function renderComponentList(state, level) {
  const items = state.components.filter((component) => component.level === level.numericLevel);
  if (items.length === 0) return renderEmpty(`No ${level.label} components registered.`);
  return `<div class="components-grid">${items.map((component) => renderComponentCard(component, level.id)).join('')}</div>`;
}

export function renderHomePage(state) {
  const levels = state.getLevelModels();

  return `
    <section class="panel is-active" data-panel="home" data-panel-label="Levels overview">
      <div class="section-card page-stack">
        ${renderBreadcrumbs([{ label: 'Levels' }])}
        <h2 class="section-title">Design Token Foundation</h2>
        <div class="level-overview-grid">
          ${levels.map(renderLevelOverviewCard).join('')}
        </div>
      </div>
    </section>
  `;
}

export function renderLevelPage(state, levelId) {
  const level = state.getLevel(levelId);

  return `
    <section class="panel is-active" data-panel="${escapeHTML(level.id)}" data-panel-label="${escapeHTML(level.title)}">
      <div class="section-card page-stack">
        ${renderBreadcrumbs([
          { label: 'Levels', route: { name: 'home' } },
          { label: level.label },
        ])}
        <div class="section-head">
          <h2 class="section-title">${escapeHTML(level.title)}</h2>
          <span class="level-chip">${escapeHTML(level.label)}</span>
        </div>
        ${level.numericLevel === 0
          ? `<div class="category-grid">${state.tokenGroupModels.map(renderTokenGroupCard).join('')}</div>`
          : renderComponentList(state, level)}
      </div>
    </section>
  `;
}

export function renderTokenGroupPage(state, groupId) {
  const group = state.getTokenGroup(groupId);

  return `
    <section class="panel is-active" data-panel="${escapeHTML(group.id)}" data-panel-label="${escapeHTML(group.title)}">
      <div class="section-card page-stack">
        ${renderBreadcrumbs([
          { label: 'Levels', route: { name: 'home' } },
          { label: state.getLevel('lv0').label, route: { name: 'level', levelId: 'lv0' } },
          { label: group.title },
        ])}
        <h2 class="section-title">${escapeHTML(group.title)}</h2>
        ${renderTokenGroupList(group)}
      </div>
    </section>
  `;
}

export function renderTokenDetailPage(state, groupId, tokenPath) {
  const group = state.getTokenGroup(groupId);
  const entry = state.getTokenByPath(tokenPath);
  if (!entry) return renderHomePage(state);

  const [path, token] = entry;
  const shortName = path.split('.').pop();

  return `
    <section class="panel is-active" data-panel="token-detail" data-panel-label="${escapeHTML(path)}">
      <div class="section-card page-stack">
        ${renderBreadcrumbs([
          { label: 'Levels', route: { name: 'home' } },
          { label: state.getLevel('lv0').label, route: { name: 'level', levelId: 'lv0' } },
          { label: group.title, route: { name: 'token-group', groupId } },
          { label: shortName },
        ])}
        <div class="section-head">
          <div>
            <h2 class="section-title">${escapeHTML(shortName)}</h2>
            <p class="helper mono" style="margin-top:2px">${escapeHTML(path)}</p>
          </div>
          <span class="level-chip">${escapeHTML(token.$type || 'token')}</span>
        </div>
        ${renderTokenDetailPreview(groupId, entry)}
        <div class="detail-grid">
          ${token.$type === 'typography' && token.resolvedValue && typeof token.resolvedValue === 'object' ? `
            ${renderDetailCard('Font size', formatValue(token.resolvedValue.fontSize ?? 'n/a'))}
            ${renderDetailCard('Font weight', formatValue(token.resolvedValue.fontWeight ?? 'n/a'))}
            ${renderDetailCard('Line height', formatValue(token.resolvedValue.lineHeight ?? 'n/a'))}
            ${renderDetailCard('Letter spacing', formatValue(token.resolvedValue.letterSpacing ?? 'n/a'))}
            ${renderDetailCard('Token type', 'typography (composite)')}
            ${renderDetailCard('CSS vars', [
              token.resolvedValue.fontFamily != null ? `${token.cssVar}-font-family` : null,
              token.resolvedValue.fontSize != null ? `${token.cssVar}-font-size` : null,
              token.resolvedValue.fontWeight != null ? `${token.cssVar}-font-weight` : null,
              token.resolvedValue.lineHeight != null ? `${token.cssVar}-line-height` : null,
              token.resolvedValue.letterSpacing != null ? `${token.cssVar}-letter-spacing` : null,
            ].filter(Boolean).join(', '), true)}
          ` : `
            ${renderDetailCard('Resolved value', formatValue(token.resolvedValue))}
            ${renderDetailCard('CSS variable', token.cssVar, true)}
            ${renderDetailCard('Token type', formatValue(token.$type))}
            ${renderDetailCard('Group', group.title)}
          `}
        </div>
        <article class="group-card">
          <div class="group-head">
            <h3 class="group-title">Metadata</h3>
            <button class="link-button" type="button" data-copy="${escapeHTML(token.cssVar)}">Copy CSS var</button>
          </div>
          <table class="all-table">
            <tbody>
              <tr>
                <td class="mono">Path</td>
                <td class="mono">${escapeHTML(path)}</td>
              </tr>
              <tr>
                <td>Description</td>
                <td>${escapeHTML(formatValue(token.$description || 'n/a'))}</td>
              </tr>
              <tr>
                <td>Original value</td>
                <td>${escapeHTML(formatValue(token.$value))}</td>
              </tr>
            </tbody>
          </table>
        </article>
      </div>
    </section>
  `;
}

export function renderComponentDetailPage(state, levelId, componentName) {
  const level = state.getLevel(levelId);
  const component = state.getComponentByName(componentName);
  if (!component) return renderHomePage(state);

  return `
    <section class="panel is-active" data-panel="component-detail" data-panel-label="${escapeHTML(component.name)}">
      <div class="section-card page-stack">
        ${renderBreadcrumbs([
          { label: 'Levels', route: { name: 'home' } },
          { label: level.label, route: { name: 'level', levelId } },
          { label: component.name },
        ])}
        <div class="section-head">
          <h2 class="section-title">${escapeHTML(component.name)}</h2>
          <div style="display:flex;gap:var(--ui-space-2);align-items:center">
            ${renderStatusPill(component.status || 'stable')}
            <span class="level-chip">${escapeHTML(component.levelLabel)}</span>
          </div>
        </div>
        <div class="detail-grid">
          ${renderDetailCard('File', component.path, true)}
          ${renderDetailCard('Variants', (component.variants || []).join(', ') || 'n/a')}
          ${renderDetailCard('Sizes', (component.sizes || []).join(', ') || 'n/a')}
          ${renderDetailCard('Contains', (component.contains || []).join(', ') || 'Leaf component')}
        </div>
        ${component.description ? `<p class="helper">${escapeHTML(component.description)}</p>` : ''}
        ${renderComponentPreviewPanel(component, state.preview)}
        <article class="group-card">
          <div class="group-head">
            <h3 class="group-title">Props</h3>
          </div>
          ${renderPropsTable(component.props)}
        </article>
        ${(component.tokens || []).length ? `
          <article class="group-card">
            <div class="group-head">
              <h3 class="group-title">Token References</h3>
            </div>
            <div class="chip-row" style="margin-top:var(--ui-space-3)">
              ${(component.tokens || []).map((tokenRef) => `<span class="chip mono">${escapeHTML(tokenRef)}</span>`).join('')}
            </div>
          </article>
        ` : ''}
      </div>
    </section>
  `;
}

export function renderPage(state, route) {
  if (route.name === 'level') return renderLevelPage(state, route.levelId);
  if (route.name === 'token-group') return renderTokenGroupPage(state, route.groupId);
  if (route.name === 'token') return renderTokenDetailPage(state, route.groupId, route.tokenPath);
  if (route.name === 'component') return renderComponentDetailPage(state, route.levelId, route.componentName);
  return renderHomePage(state);
}
