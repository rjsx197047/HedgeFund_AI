import { useEffect, useState } from 'react';
import styles from './Analyze.module.css';
import DebateStream from '../components/DebateStream';
import {
  getHandshake,
  streamDebate,
  type DebateEvent,
} from '../lib/engine-client';

type EngineStatus = 'pending' | 'running' | 'error';

function Analyze() {
  const [ticker, setTicker] = useState('NVDA');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('pending');
  const [engineError, setEngineError] = useState<string | null>(null);
  const [events, setEvents] = useState<DebateEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHandshake()
      .then(() => {
        if (!cancelled) {
          setEngineStatus('running');
          setEngineError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setEngineStatus('error');
          setEngineError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onAnalyze = async () => {
    if (engineStatus !== 'running' || isStreaming) return;
    setEvents([]);
    setStreamError(null);
    setIsStreaming(true);
    try {
      const handle = await streamDebate(
        { ticker, trade_date: date },
        (event) => setEvents((prev) => [...prev, event]),
        (err) => {
          setStreamError(err instanceof Error ? err.message : 'stream error');
        },
      );
      await handle.done;
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : 'stream failed');
    } finally {
      setIsStreaming(false);
    }
  };

  const buttonDisabled = engineStatus !== 'running' || isStreaming;

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
              disabled={isStreaming}
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
              disabled={isStreaming}
            />
          </div>
          <div className={styles.fieldButton}>
            <button
              className={styles.button}
              disabled={buttonDisabled}
              onClick={onAnalyze}
            >
              {isStreaming ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
        </div>
        <p className={styles.helper}>
          {engineStatus === 'pending' && 'Engine starting — sidecar handshake pending.'}
          {engineStatus === 'running' && !isStreaming &&
            'Stub debate — Phase 3 streams a canned 16-event sequence over ~7s.'}
          {engineStatus === 'running' && isStreaming &&
            'Streaming agent debate from sidecar…'}
          {engineStatus === 'error' &&
            `Engine failed to start: ${engineError ?? 'unknown error'}`}
        </p>
        {streamError && (
          <p className={styles.errorBanner}>Stream error: {streamError}</p>
        )}
      </section>

      <section className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <div className={styles.statusLabel}>Engine</div>
          <div className={styles.statusValue}>
            <span
              className={
                engineStatus === 'running'
                  ? styles.statusDotOk
                  : engineStatus === 'error'
                    ? styles.statusDotError
                    : styles.statusDotPending
              }
            />
            {engineStatus === 'running' && 'Running'}
            {engineStatus === 'pending' && 'Starting…'}
            {engineStatus === 'error' && 'Error'}
          </div>
          <div className={styles.statusHint}>Python sidecar · stub debate</div>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusLabel}>LLM</div>
          <div className={styles.statusValue}>
            <span className={styles.statusDotPending} />
            Not configured
          </div>
          <div className={styles.statusHint}>Settings → LLM Providers (Phase 4)</div>
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

      <DebateStream events={events} isStreaming={isStreaming} />

      <section className={styles.disclaimer}>
        <strong>For educational research and paper trading.</strong> TradingAgentsLab
        does not provide investment advice. Trading decisions and any real-money
        outcomes are entirely your own.
      </section>
    </div>
  );
}

export default Analyze;
