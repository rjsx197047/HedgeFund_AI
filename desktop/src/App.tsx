import Analyze from './pages/Analyze';
import styles from './App.module.css';

function App() {
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
        <a className={`${styles.navItem} ${styles.navItemActive}`} href="#analyze">
          <span className={styles.navItemDot} />
          Analyze
        </a>
        <a className={styles.navItem} href="#watchlist">
          <span className={styles.navItemDot} />
          Watchlist
        </a>
        <a className={styles.navItem} href="#history">
          <span className={styles.navItemDot} />
          History
        </a>
        <div className={styles.navSpacer} />
        <a className={styles.navItem} href="#settings">
          <span className={styles.navItemDot} />
          Settings
        </a>
      </nav>

      <main className={`${styles.main} app-no-drag`}>
        <Analyze />
      </main>

      <footer className={styles.footer}>
        <span>v0.0.1 · Phase 1 · Educational lab + paper trading</span>
        <span className={styles.footerRight}>This is not investment advice.</span>
      </footer>
    </div>
  );
}

export default App;
