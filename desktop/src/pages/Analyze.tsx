import { useEffect, useRef, useState } from 'react';
import styles from './Analyze.module.css';
import DebateStream from '../components/DebateStream';
import {
  getHandshake,
  getHealth,
  streamDebate,
  type DebateEvent,
  type StreamHandle,
} from '../lib/engine-client';
import { buildTranscriptMarkdown } from '../lib/transcript';

type EngineStatus = 'pending' | 'running' | 'error';

function Analyze() {
  const [ticker, setTicker] = useState('NVDA');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('pending');
  const [engineError, setEngineError] = useState<string | null>(null);
  const [dataProvider, setDataProvider] = useState<string | null>(null);
  const [events, setEvents] = useState<DebateEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const handleRef = useRef<StreamHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHandshake()
      .then(() => getHealth())
      .then((health) => {
        if (cancelled) return;
        setEngineStatus('running');
        setEngineError(null);
        setDataProvider(health.data_provider ?? null);
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
    setCopied(false);
    setIsStreaming(true);
    try {
      const handle = await streamDebate(
        { ticker, trade_date: date },
        (event) => setEvents((prev) => [...prev, event]),
        (err) => {
          setStreamError(err instanceof Error ? err.message : 'stream error');
        },
      );
      handleRef.current = handle;
      await handle.done;
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : 'stream failed');
    } finally {
      handleRef.current = null;
      setIsStreaming(false);
    }
  };

  const onStop = () => {
    handleRef.current?.close();
  };

  const onCopyTranscript = async () => {
    if (!events.length) return;
    const md = buildTranscriptMarkdown(events);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setStreamError(`copy failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  const buttonDisabled = engineStatus !== 'running' || isStreaming;
  const transcriptReady = events.some((e) => e.type === 'session.complete');

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
            {isStreaming ? (
              <button
                className={`${styles.button} ${styles.buttonStop}`}
                onClick={onStop}
                type="button"
              >
                Stop
              </button>
            ) : (
              <button
                className={styles.button}
                disabled={buttonDisabled}
                onClick={onAnalyze}
                type="button"
              >
                Analyze
              </button>
            )}
          </div>
        </div>
        <div className={styles.cardFooter}>
          <p className={styles.helper}>
            {engineStatus === 'pending' && 'Engine starting — sidecar handshake pending.'}
            {engineStatus === 'running' && !isStreaming &&
              'Stub debate — analyst messages reference real data when reachable.'}
            {engineStatus === 'running' && isStreaming &&
              'Streaming agent debate from sidecar — Stop to abort.'}
            {engineStatus === 'error' &&
              `Engine failed to start: ${engineError ?? 'unknown error'}`}
          </p>
          {transcriptReady && !isStreaming && (
            <button
              className={styles.transcriptButton}
              onClick={onCopyTranscript}
              type="button"
            >
              {copied ? 'Copied ✓' : 'Copy transcript (Markdown)'}
            </button>
          )}
        </div>
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
          <div className={styles.statusLabel}>Data</div>
          <div className={styles.statusValue}>
            <span
              className={
                dataProvider ? styles.statusDotOk : styles.statusDotPending
              }
            />
            {dataProvider ? `${dataProvider} · live` : 'Pending…'}
          </div>
          <div className={styles.statusHint}>
            {dataProvider === 'yfinance'
              ? 'Yahoo Finance · free · default'
              : 'yfinance default · Alpaca optional'}
          </div>
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
