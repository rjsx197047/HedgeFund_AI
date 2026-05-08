import { useEffect, useState } from 'react';
import Analyze from './pages/Analyze';
import Settings from './pages/Settings';
import ComingSoon from './pages/ComingSoon';
import styles from './App.module.css';

type Route = 'analyze' | 'watchlist' | 'history' | 'settings';

const ROUTES: Route[] = ['analyze', 'watchlist', 'history', 'settings'];

function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#/, '') as Route;
  return ROUTES.includes(cleaned) ? cleaned : 'analyze';
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
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
        {route === 'analyze' && <Analyze />}
        {route === 'watchlist' && (
          <ComingSoon
            title="Watchlist"
            description="Track multiple tickers and re-run analyses on a daily cadence. Phase 7."
          />
        )}
        {route === 'history' && (
          <ComingSoon
            title="History"
            description="Past decisions, paper-trade P&L, and the full multi-agent debate log for each session. Phase 7."
          />
        )}
        {route === 'settings' && <Settings />}
      </main>

      <footer className={styles.footer}>
        <span>v0.0.1 · Phase 3 · Educational lab + paper trading</span>
        <span className={styles.footerRight}>This is not investment advice.</span>
      </footer>
    </div>
  );
}

export default App;
