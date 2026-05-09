import { useEffect, useState } from 'react';
import Analyze from './pages/Analyze';
import Settings from './pages/Settings';
import History from './pages/History';
import Watchlist from './pages/Watchlist';
import styles from './App.module.css';

type Route = 'analyze' | 'watchlist' | 'history' | 'settings';

const ROUTES: Route[] = ['analyze', 'watchlist', 'history', 'settings'];

function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#/, '') as Route;
  return ROUTES.includes(cleaned) ? cleaned : 'analyze';
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [newAnalysisTick, setNewAnalysisTick] = useState(0);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // App menu accelerators come in via IPC.
  useEffect(() => {
    const bridge = window.tradingAgentsLab;
    if (!bridge?.onMenuCommand) return;
    const unsubNav = bridge.onMenuCommand('menu:navigate', (...args: unknown[]) => {
      const target = args[0];
      if (typeof target === 'string' && ROUTES.includes(target as Route)) {
        window.location.hash = `#${target}`;
      }
    });
    const unsubNew = bridge.onMenuCommand('menu:new-analysis', () => {
      window.location.hash = '#analyze';
      setNewAnalysisTick((n) => n + 1);
    });
    return () => {
      unsubNav();
      unsubNew();
    };
  }, []);

  const navItem = (target: Route, label: string) => {
    const active = route === target;
    return (
      <a
        className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
        href={`#${target}`}
      >
        <span className={styles.navItemDot} />
        {label}
      </a>
    );
  };

  return (
    <div className={styles.shell}>
      <header className={`${styles.titleBar} app-drag-region`}>
        <div className={styles.titleBarContent}>
          <span className={styles.brand}>
            <span className={styles.brandMark}>◆</span>
            <span className={styles.brandText}>TradingAgentsLab</span>
          </span>
          <span className={styles.connectionPill}>Standalone</span>
        </div>
      </header>

      <nav className={`${styles.sidebar} app-no-drag`}>
        {navItem('analyze', 'Analyze')}
        {navItem('watchlist', 'Watchlist')}
        {navItem('history', 'History')}
        <div className={styles.navSpacer} />
        {navItem('settings', 'Settings')}
      </nav>

      <main className={`${styles.main} app-no-drag`}>
        {route === 'analyze' && <Analyze resetSignal={newAnalysisTick} />}
        {route === 'watchlist' && <Watchlist />}
        {route === 'history' && <History />}
        {route === 'settings' && <Settings />}
      </main>

      <footer className={styles.footer}>
        <span>v0.0.1 · Phase 4 · Educational lab + paper trading</span>
        <span className={styles.footerRight}>This is not investment advice.</span>
      </footer>
    </div>
  );
}

export default App;
