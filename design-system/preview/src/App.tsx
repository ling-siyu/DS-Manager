import { useEffect, useState } from 'react';
import { data } from './data';
import TokenGallery from './tokens/TokenGallery';
import ComponentMatrix from './components/ComponentMatrix';

type Route = 'components' | 'tokens-securamark' | 'tokens-dsm';
export type Theme = 'light' | 'dark';
export type Viewport = 'full' | 'tablet' | 'mobile';

const ROUTES: { id: Route; label: string; count: number }[] = [
  { id: 'components', label: 'Components', count: data.components.length },
  { id: 'tokens-securamark', label: 'SecuraMark tokens', count: data.tokenSets.securamark.length },
  { id: 'tokens-dsm', label: 'DSM tokens', count: data.tokenSets.dsm.length },
];

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES.find((r) => r.id === h)?.id ?? 'components') as Route;
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [theme, setTheme] = useState<Theme>('light');
  const [viewport, setViewport] = useState<Viewport>('full');

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand">DSM Preview</div>
        <nav>
          {ROUTES.map((r) => (
            <a
              key={r.id}
              href={`#/${r.id}`}
              className={`nav-item${route === r.id ? ' active' : ''}`}
            >
              <span>{r.label}</span>
              <span className="nav-count">{r.count}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">Milestone 1 · foundation</div>
      </aside>

      <main className="main">
        <header className="toolbar">
          <h1 className="toolbar-title">{ROUTES.find((r) => r.id === route)?.label}</h1>
          <div className="toolbar-controls">
            <div className="seg" role="group" aria-label="Theme">
              {(['light', 'dark'] as Theme[]).map((t) => (
                <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
                  {t}
                </button>
              ))}
            </div>
            {route === 'components' && (
              <div className="seg" role="group" aria-label="Viewport">
                {(['full', 'tablet', 'mobile'] as Viewport[]).map((v) => (
                  <button key={v} className={viewport === v ? 'on' : ''} onClick={() => setViewport(v)}>
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="content">
          {route === 'components' && (
            <ComponentMatrix components={data.components} theme={theme} viewport={viewport} />
          )}
          {route === 'tokens-securamark' && (
            <TokenGallery tokens={data.tokenSets.securamark} showThemeVariants />
          )}
          {route === 'tokens-dsm' && <TokenGallery tokens={data.tokenSets.dsm} />}
        </div>
      </main>
    </div>
  );
}
