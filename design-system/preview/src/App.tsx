import { useEffect, useMemo, useState } from 'react';
import { data } from './data';
import Canvas, { scenariosOf } from './components/Canvas';
import type { CanvasFrame } from './components/Canvas';
import LiveRender from './components/LiveRender';
import Inspector from './components/Inspector';
import { getSections } from './tokens/sections';
import IconSetGrid from './tokens/IconSetGrid';
import { CATEGORIES, categoryOf } from './lib/tokenKind';
import type { TokenCategory } from './lib/tokenKind';
import type { PreviewComponent, SecuraMarkComponent as SMComponent } from './types';

export type Theme = 'light' | 'dark';
type Source = 'securamark' | 'dsm';
type Route = 'components' | TokenCategory;

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'components') return 'components';
  return (CATEGORIES.find((c) => c.id === h)?.id ?? 'components') as Route;
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [source, setSource] = useState<Source>('securamark');
  const [theme, setTheme] = useState<Theme>('light');
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [scenarioIdx, setScenarioIdx] = useState(0);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Clear search + selection whenever the content set changes.
  useEffect(() => {
    setQuery('');
    setSelectedName(null);
  }, [route, source]);

  const isToken = route !== 'components';
  const tokens = data.tokenSets[source];
  const componentList = source === 'securamark' ? (data.securamark?.components ?? []) : data.components;
  const iconWeight = data.icons?.securamark?.style?.weight ?? 'light';

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of tokens) {
      const k = categoryOf(t);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [tokens]);

  const iconCapture = isToken ? data.icons?.[source] ?? null : null;
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
  }, [isToken, tokens, route, theme, source, iconCapture]);

  // Build canvas frames for the active route, filtered by the search query.
  const frames = useMemo<CanvasFrame[]>(() => {
    const q = query.trim().toLowerCase();
    if (!isToken) {
      return componentList
        .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
        .map((c: PreviewComponent | SMComponent) => {
          // The selected component mirrors the inspector's active variation on
          // the canvas; every other frame shows its default scenario.
          const sc = scenariosOf(c);
          const idx = c.name === selectedName ? Math.min(scenarioIdx, sc.length - 1) : 0;
          return {
            id: c.name,
            label: c.name,
            variant: 'component' as const,
            status: c.status,
            selectable: true,
            node: (
              <LiveRender
                component={c}
                source={source}
                iconWeight={iconWeight}
                scenarioProps={sc[idx].props}
                resetKey={`canvas:${source}:${c.name}:${idx}`}
              />
            ),
          };
        });
    }
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
  }, [isToken, componentList, sections, source, iconWeight, query, selectedName, scenarioIdx]);

  const total = isToken ? sections.length : componentList.length;
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
        resetKey={`${route}:${source}`}
        controls={
          <>
            <div className="seg" role="group" aria-label="Source">
              {(['securamark', 'dsm'] as Source[]).map((s) => (
                <button key={s} className={source === s ? 'on' : ''} onClick={() => setSource(s)}>
                  {s === 'securamark' ? 'SecuraMark' : 'DSM'}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Theme">
              {(['light', 'dark'] as Theme[]).map((t) => (
                <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
                  {t}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="dock dock-top">
        <nav className="nav-panel">
          <div className="brand">DSM</div>
          {navItems.map((it) => (
            <a key={it.id} href={`#/${it.id}`} className={`nav-item${route === it.id ? ' active' : ''}`}>
              <span>{it.label}</span>
              <span className="nav-count">{it.id === 'components' ? componentList.length : counts[it.id] ?? 0}</span>
            </a>
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
          {query && <span className="search-count">{frames.length}/{total}</span>}
        </div>
      </div>

      {selected && (
        <Inspector
          key={`${source}:${selected.name}`}
          component={selected}
          source={source}
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
