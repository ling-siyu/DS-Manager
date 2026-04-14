import { renderLevelNav } from './components.js';
import { createAppState, parseRoute, toHash } from './models.js';
import { renderPage } from './pages.js';
import { copyText, createToastController, normalize } from './utils.js';

const state = createAppState(window.__DSM_DATA__ || { tokens: {}, components: [] });
const toast = createToastController(document.getElementById('toast'));
const openLevels = new Set();

function getActiveLevelId(route) {
  if (route.name === 'level') return route.levelId;
  if (route.name === 'component') return route.levelId;
  if (route.name === 'token' || route.name === 'token-group') return 'lv0';
  return null;
}

function getActiveChildId(route) {
  if (route.name === 'token-group') return route.groupId;
  if (route.name === 'token') return route.groupId;
  if (route.name === 'component') return route.componentName;
  return null;
}

function renderNav(route) {
  const nav = document.getElementById('level-nav');
  const activeLevelId = getActiveLevelId(route);
  // Auto-open active level
  if (activeLevelId) openLevels.add(activeLevelId);
  nav.innerHTML = renderLevelNav(
    state.getLevelModels(),
    activeLevelId,
    state.tokenGroupModels,
    state.components,
    openLevels,
    getActiveChildId(route),
  );
  window.lucide?.createIcons();
}

function navigate(route) {
  const nextHash = toHash(route);
  if (window.location.hash === nextHash) {
    renderApp();
    return;
  }

  window.location.hash = nextHash;
}

function applySearch(query) {
  const text = normalize(query);
  const activePanel = document.querySelector('[data-panel].is-active');
  const scope = activePanel || document;

  scope.querySelectorAll('[data-filter-item]').forEach((node) => {
    const haystack = node.getAttribute('data-query') || '';
    node.classList.toggle('hidden-by-search', text !== '' && !haystack.includes(text));
  });
}

function renderApp() {
  const route = parseRoute();
  const panels = document.getElementById('panels');
  const search = document.getElementById('search');

  renderNav(route);
  panels.innerHTML = renderPage(state, route);
  window.lucide?.createIcons();
  applySearch(search ? search.value : '');
}

function connectSSE() {
  const source = new EventSource('/events');
  source.onmessage = (event) => {
    if (event.data === 'reload') {
      window.location.reload();
    }
  };
  source.onerror = () => {
    source.close();
    window.setTimeout(connectSSE, 3000);
  };
}

document.addEventListener('click', (event) => {
  const toggleTrigger = event.target.closest('[data-toggle-level]');
  if (toggleTrigger) {
    const levelId = toggleTrigger.getAttribute('data-toggle-level');
    if (openLevels.has(levelId)) {
      openLevels.delete(levelId);
    } else {
      openLevels.add(levelId);
    }
    renderNav(parseRoute());
    return;
  }

  const routeTrigger = event.target.closest('[data-route]');
  if (routeTrigger) {
    navigate(JSON.parse(routeTrigger.getAttribute('data-route')));
    return;
  }

  const copyTrigger = event.target.closest('[data-copy]');
  if (!copyTrigger) return;
  copyText(copyTrigger.getAttribute('data-copy'), toast.show.bind(toast));
});

window.addEventListener('hashchange', renderApp);

document.addEventListener('DOMContentLoaded', () => {
  renderApp();
  document.getElementById('search').addEventListener('input', (event) => {
    applySearch(event.target.value);
  });
  connectSSE();
});
