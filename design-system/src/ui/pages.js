import {
  renderBreadcrumbs,
  renderComponentCard,
  renderComponentPreviewPanel,
  renderDetailCard,
  renderEmpty,
  renderLevelOverviewCard,
  renderPropsTable,
  renderStatusPill,
  renderSummaryCard,
  renderTokenCard,
  renderTokenDetailPreview,
  renderTokenGroupCard,
} from './components.js';
import { escapeHTML, formatValue } from './utils.js';

function renderTokenGroupList(group) {
  if (group.entries.length === 0) return renderEmpty(`No ${group.title.toLowerCase()} found.`);
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
        <div class="section-head">
          <div>
            <h2 class="section-title">Level Overview</h2>
            <p class="section-copy">Start with a level, open its asset list, then drill into token or component details.</p>
          </div>
          <span class="level-chip">${levels.length} levels</span>
        </div>
        <div class="summary-strip">
          ${renderSummaryCard('Tokens', String(state.tokenEntries.length))}
          ${renderSummaryCard('Components', String(state.components.length))}
          ${renderSummaryCard('Highest level', levels[levels.length - 1]?.label || 'Lv.0')}
        </div>
        <div class="level-overview-grid">
          ${levels.map(renderLevelOverviewCard).join('')}
        </div>
      </div>
    </section>
  `;
}

export function renderLevelPage(state, levelId) {
  const level = state.getLevel(levelId);
  const items = level.numericLevel === 0
    ? state.tokenGroupModels.length
    : state.components.filter((component) => component.level === level.numericLevel).length;
  const composedCount = level.numericLevel === 0
    ? state.tokenGroupModels.filter((group) => group.entries.length > 0).length
    : state.components.filter((component) => component.level === level.numericLevel && (component.contains || []).length).length;
  const leafCount = level.numericLevel === 0 ? 0 : items - composedCount;

  return `
    <section class="panel is-active" data-panel="${escapeHTML(level.id)}" data-panel-label="${escapeHTML(level.title)}">
      <div class="section-card page-stack">
        ${renderBreadcrumbs([
          { label: 'Levels', route: { name: 'home' } },
          { label: level.label },
        ])}
        <div class="section-head">
          <div>
            <h2 class="section-title">${escapeHTML(level.title)}</h2>
            <p class="section-copy">${escapeHTML(level.description)}</p>
          </div>
          <span class="level-chip">${escapeHTML(level.label)}</span>
        </div>
        <div class="summary-strip">
          ${renderSummaryCard(level.numericLevel === 0 ? 'Token types' : 'Registered', String(items))}
          ${renderSummaryCard(level.numericLevel === 0 ? 'Populated types' : 'Composed', String(composedCount))}
          ${renderSummaryCard(level.numericLevel === 0 ? 'Total tokens' : 'Leaf', String(level.numericLevel === 0 ? state.tokenEntries.length : leafCount))}
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
        <div class="section-head">
          <div>
            <h2 class="section-title">${escapeHTML(group.title)}</h2>
            <p class="section-copy">${escapeHTML(group.description)}</p>
          </div>
          <span class="level-chip">${group.entries.length} tokens</span>
        </div>
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

  return `
    <section class="panel is-active" data-panel="token-detail" data-panel-label="${escapeHTML(path)}">
      <div class="section-card page-stack">
        ${renderBreadcrumbs([
          { label: 'Levels', route: { name: 'home' } },
          { label: state.getLevel('lv0').label, route: { name: 'level', levelId: 'lv0' } },
          { label: group.title, route: { name: 'token-group', groupId } },
          { label: path },
        ])}
        <div class="section-head">
          <div>
            <h2 class="section-title">${escapeHTML(path)}</h2>
            <p class="section-copy">${escapeHTML(token.$description || 'Token detail view for inspection and handoff.')}</p>
          </div>
          <span class="level-chip">${escapeHTML(token.$type || 'token')}</span>
        </div>
        <div class="section-actions">
          <button class="link-button" type="button" data-copy="${escapeHTML(token.cssVar)}">Copy CSS variable</button>
          <p class="helper mono">${escapeHTML(token.cssVar)}</p>
        </div>
        ${renderTokenDetailPreview(groupId, entry)}
        <div class="detail-grid">
          ${renderDetailCard('Resolved value', formatValue(token.resolvedValue))}
          ${renderDetailCard('CSS variable', token.cssVar, true)}
          ${renderDetailCard('Token type', formatValue(token.$type))}
          ${renderDetailCard('Group', group.title)}
        </div>
        <article class="group-card">
          <div class="group-head">
            <h3 class="group-title">Metadata</h3>
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
          <div>
            <h2 class="section-title">${escapeHTML(component.name)}</h2>
            <p class="section-copy">${escapeHTML(component.description || 'Registered component in the DSM registry.')}</p>
          </div>
          <span class="level-chip">${escapeHTML(component.levelLabel)}</span>
        </div>
        <div class="section-actions">
          <button class="link-button" type="button" data-copy="${escapeHTML(component.path)}">Copy file path</button>
          ${renderStatusPill(component.status || 'stable')}
        </div>
        <div class="detail-grid">
          ${renderDetailCard('File', component.path, true)}
          ${renderDetailCard('Variants', (component.variants || []).join(', ') || 'n/a')}
          ${renderDetailCard('Sizes', (component.sizes || []).join(', ') || 'n/a')}
          ${renderDetailCard('Contains', (component.contains || []).join(', ') || 'Leaf component')}
        </div>
        ${renderComponentPreviewPanel(component, state.preview)}
        <article class="group-card">
          <div class="group-head">
            <h3 class="group-title">Props</h3>
          </div>
          ${renderPropsTable(component.props)}
        </article>
        <article class="group-card">
          <div class="group-head">
            <h3 class="group-title">Registry Metadata</h3>
          </div>
          <div class="chip-row">
            ${(component.tokens || []).length
              ? (component.tokens || []).map((tokenRef) => `<span class="chip mono">${escapeHTML(tokenRef)}</span>`).join('')
              : '<span class="chip">No token references</span>'}
          </div>
        </article>
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
