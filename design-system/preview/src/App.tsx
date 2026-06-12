import { Fragment, useEffect, useMemo, useState } from 'react';
import { data } from './data';
import Canvas, { scenariosOf } from './components/Canvas';
import type { CanvasFrame } from './components/Canvas';
import LiveRender from './components/LiveRender';
import Inspector from './components/Inspector';
import CategoryNav from './components/CategoryNav';
import { buildCategoryTree, matchesCategory } from './lib/categoryTree';
import { getSections } from './tokens/sections';
import IconSetGrid from './tokens/IconSetGrid';
import { CATEGORIES, categoryOf } from './lib/tokenKind';
import type { TokenCategory } from './lib/tokenKind';

export type Theme = 'light' | 'dark';
type Route = 'components' | TokenCategory;

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'components') return 'components';
  return (CATEGORIES.find((c) => c.id === h)?.id ?? 'components') as Route;
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [theme, setTheme] = useState<Theme>((data.defaultTheme as Theme) ?? 'dark');
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [scenarioIdx, setScenarioIdx] = useState(0);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Clear search + selection + category filter whenever the route changes.
  useEffect(() => {
    setQuery('');
    setSelectedName(null);
    setSelectedCategory(null);
  }, [route]);

  const isToken = route !== 'components';
  const tokens = data.tokens;
  const componentList = data.components;
  const iconWeight = data.icons?.style?.weight ?? 'light';

  const categoryTree = useMemo(() => buildCategoryTree(componentList), [componentList]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of tokens) {
      const k = categoryOf(t);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [tokens]);

  const iconCapture = isToken ? data.icons ?? null : null;
  const sections = useMemo(() => {
    if (!isToken) return [];
    const base = getSections(tokens.filter((t) => categoryOf(t) === route), route as TokenCategory, theme);
    if (route === 'icons' && iconCapture && iconCapture.icons.length > 0) {
      return [
        { id: 'icon-set', title: `${iconCapture.set} icons`, count: iconCapture.icons.length, node: <IconSetGrid capture={iconCapture} /> },
        ...base,
      ];
    }
    return base;
  }, [isToken, tokens, route, theme, iconCapture]);

  // Components matching the active category filter + search query.
  const visibleComponents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return componentList.filter((c) =>
      matchesCategory(c.category, selectedCategory) &&
      (!q || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)),
    );
  }, [componentList, selectedCategory, query]);

  // Build canvas frames for the active route. Components are grouped by category
  // with a full-width section header band before each group.
  const frames = useMemo<CanvasFrame[]>(() => {
    if (!isToken) {
      const byCat = new Map<string, typeof visibleComponents>();
      for (const c of visibleComponents) {
        const cat = c.category || 'Uncategorized';
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat)!.push(c);
      }
      const out: CanvasFrame[] = [];
      for (const cat of [...byCat.keys()].sort()) {
        const items = byCat.get(cat)!;
        out.push({ id: `__section__${cat}`, label: cat, variant: 'section', count: items.length, selectable: false, node: null });
        for (const c of items) {
          // The selected component mirrors the inspector's active variation on
          // the canvas; every other frame shows its default scenario.
          const sc = scenariosOf(c);
          const idx = c.name === selectedName ? Math.min(scenarioIdx, sc.length - 1) : 0;
          out.push({
            id: c.name,
            label: c.name,
            variant: 'component',
            status: c.status,
            selectable: true,
            node: (
              <LiveRender
                component={c}
                iconWeight={iconWeight}
                theme={theme}
                scenarioProps={sc[idx].props}
                resetKey={`canvas:${c.name}:${idx}`}
              />
            ),
          });
        }
      }
      return out;
    }
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => !q || s.title.toLowerCase().includes(q))
      .map((s) => ({
        id: s.id,
        label: s.title,
        variant: 'token' as const,
        count: s.count,
        selectable: false,
        node: <div className="token-frame">{s.node}</div>,
      }));
  }, [isToken, visibleComponents, sections, iconWeight, theme, query, selectedName, scenarioIdx]);

  // Denominator for the search pill; numerator counts real matches (not the
  // section-header frames).
  const total = isToken ? sections.length : componentList.length;
  const shownCount = isToken ? frames.length : visibleComponents.length;
  const selected = useMemo(
    () => (isToken ? null : componentList.find((c) => c.name === selectedName) ?? null),
    [isToken, componentList, selectedName],
  );

  const onSelect = (id: string | null) => {
    setSelectedName(id);
    setScenarioIdx(0);
  };

  const navItems: { id: Route; label: string }[] = [
    { id: 'components', label: 'Components' },
    ...CATEGORIES.map((c) => ({ id: c.id as Route, label: c.label })),
  ];

  return (
    <div className="app" data-theme={theme}>
      <Canvas
        frames={frames}
        selectedId={selected?.name ?? null}
        onSelect={onSelect}
        theme={theme}
        resetKey={`${route}:${selectedCategory ?? 'all'}`}
        controls={
          <div className="seg" role="group" aria-label="Theme">
            {(['light', 'dark'] as Theme[]).map((t) => (
              <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
                {t}
              </button>
            ))}
          </div>
        }
      />

      <div className="dock dock-top">
        <nav className="nav-panel">
          <div className="brand">DSM</div>
          {navItems.map((it) => (
            <Fragment key={it.id}>
              <a
                href={`#/${it.id}`}
                className={`nav-item${route === it.id ? ' active' : ''}`}
                onClick={it.id === 'components' ? () => setSelectedCategory(null) : undefined}
              >
                <span>{it.label}</span>
                <span className="nav-count">{it.id === 'components' ? componentList.length : counts[it.id] ?? 0}</span>
              </a>
              {it.id === 'components' && route === 'components' && categoryTree.length > 0 && (
                <CategoryNav nodes={categoryTree} selected={selectedCategory} onSelect={setSelectedCategory} />
              )}
            </Fragment>
          ))}
        </nav>

        <div className="search-pill">
          <input
            type="search"
            placeholder={`Search ${total} ${isToken ? 'groups' : 'components'}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            aria-label="Search"
          />
          {query && <span className="search-count">{shownCount}/{total}</span>}
        </div>
      </div>

      {selected && (
        <Inspector
          key={selected.name}
          component={selected}
          iconWeight={iconWeight}
          theme={theme}
          scenarioIdx={scenarioIdx}
          onScenarioChange={setScenarioIdx}
          onClose={() => setSelectedName(null)}
        />
      )}
    </div>
  );
}
