import { useState } from 'react';
import styles from './Analyze.module.css';

function Analyze() {
  const [ticker, setTicker] = useState('NVDA');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Analyze</h1>
        <p className={styles.pageSubtitle}>
          Run a multi-agent analysis of a ticker on a specific date. The analyst,
          researcher, trader, and risk-manager agents debate and produce a
          recommendation.
        </p>
      </header>

      <section className={styles.card}>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ticker">Ticker</label>
            <input
              id="ticker"
              className={styles.input}
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="NVDA"
              maxLength={6}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="date">As-of date</label>
            <input
              id="date"
              type="date"
              className={styles.input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className={styles.fieldButton}>
            <button className={styles.button} disabled>
              Analyze
            </button>
          </div>
        </div>
        <p className={styles.helper}>
          Engine not connected yet — Phase 2 wires this button to the FastAPI sidecar.
        </p>
      </section>

      <section className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <div className={styles.statusLabel}>Engine</div>
          <div className={styles.statusValue}>
            <span className={styles.statusDotPending} />
            Not running
          </div>
          <div className={styles.statusHint}>Python sidecar — Phase 2</div>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusLabel}>LLM</div>
          <div className={styles.statusValue}>
            <span className={styles.statusDotPending} />
            Not configured
          </div>
          <div className={styles.statusHint}>Settings → LLM Providers</div>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusLabel}>Data</div>
          <div className={styles.statusValue}>
            <span className={styles.statusDotPending} />
            Not configured
          </div>
          <div className={styles.statusHint}>yfinance default · Alpaca optional</div>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusLabel}>Clawless</div>
          <div className={styles.statusValue}>
            <span className={styles.statusDotPending} />
            Disconnected
          </div>
          <div className={styles.statusHint}>Optional connector — Phase 6</div>
        </div>
      </section>

      <section className={styles.disclaimer}>
        <strong>For educational research and paper trading.</strong> TradingAgentsLab
        does not provide investment advice. Trading decisions and any real-money
        outcomes are entirely your own.
      </section>
    </div>
  );
}

export default Analyze;
