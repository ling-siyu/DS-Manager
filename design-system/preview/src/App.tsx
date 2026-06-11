import { useEffect, useMemo, useState } from 'react';
import { data } from './data';
import ComponentCanvas from './components/ComponentCanvas';
import { getSections, SectionList } from './tokens/sections';
import IconSetGrid from './tokens/IconSetGrid';
import { CATEGORIES, categoryOf } from './lib/tokenKind';
import type { TokenCategory } from './lib/tokenKind';

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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const goToSection = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id); // expand before scrolling
      return next;
    });
    setTimeout(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const title = route === 'components' ? 'Components' : CATEGORIES.find((c) => c.id === route)?.label;

  return (
    <div className="app" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand">DSM Preview</div>
        <nav>
          <a href="#/components" className={`nav-item${route === 'components' ? ' active' : ''}`}>
            <span>Components</span>
            <span className="nav-count">{componentList.length}</span>
          </a>
          <div className="nav-label">Tokens</div>
          {CATEGORIES.map((c) => (
            <div key={c.id}>
              <a href={`#/${c.id}`} className={`nav-item${route === c.id ? ' active' : ''}`}>
                <span>{c.label}</span>
                <span className="nav-count">{counts[c.id] ?? 0}</span>
              </a>
              {route === c.id && sections.length > 0 && (
                <div className="nav-children">
                  {sections.map((s) => (
                    <button key={s.id} className="nav-child" onClick={() => goToSection(s.id)}>
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">Milestone 1 · foundation</div>
      </aside>

      <main className={`main${route === 'components' ? ' canvas-mode' : ''}`}>
        <header className="toolbar">
          <h1 className="toolbar-title">{title}</h1>
          <div className="toolbar-controls">
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
          </div>
        </header>

        {route === 'components' ? (
          <ComponentCanvas
            components={componentList}
            source={source}
            iconWeight={iconWeight}
            theme={theme}
          />
        ) : (
          <div className="content">
            <SectionList sections={sections} collapsed={collapsed} onToggle={toggle} />
          </div>
        )}
      </main>
    </div>
  );
}
