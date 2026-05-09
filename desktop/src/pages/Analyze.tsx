import { useEffect, useRef, useState } from 'react';
import styles from './Analyze.module.css';
import DebateStream from '../components/DebateStream';
import {
  getHandshake,
  getHealth,
  streamDebate,
  type DebateEvent,
  type ProviderConfig,
  type StreamHandle,
} from '../lib/engine-client';
import { buildTranscriptMarkdown } from '../lib/transcript';
import { getSecret, listSecrets } from '../lib/secrets';
import { consumePendingTicker } from '../lib/handoff';

type EngineStatus = 'pending' | 'running' | 'error';

interface AnalyzeProps {
  /** Increments when the App menu fires "New analysis" — clears prior results. */
  resetSignal?: number;
}

function Analyze({ resetSignal = 0 }: AnalyzeProps) {
  // Honor a watchlist hand-off if one is queued in sessionStorage. Falls
  // back to the default NVDA when there isn't one. App.tsx renders Analyze
  // conditionally with `&&`, so navigating to Analyze always re-runs this
  // initializer and consumes any freshly queued hand-off ticker.
  const [ticker, setTicker] = useState(() => consumePendingTicker() ?? 'NVDA');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('pending');
  const [engineError, setEngineError] = useState<string | null>(null);
  const [dataProvider, setDataProvider] = useState<string | null>(null);
  const [events, setEvents] = useState<DebateEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Whether an OpenAI key is configured (drives live vs stub mode). */
  const [hasOpenAIKey, setHasOpenAIKey] = useState<boolean>(false);
  const handleRef = useRef<StreamHandle | null>(null);
  const isStreamingRef = useRef(false);
  const engineReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getHandshake()
      .then(() => getHealth())
      .then((health) => {
        if (cancelled) return;
        setEngineStatus('running');
        engineReadyRef.current = true;
        setEngineError(null);
        setDataProvider(health.data_provider ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setEngineStatus('error');
          engineReadyRef.current = false;
          setEngineError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset state when the menu fires "New analysis".
  useEffect(() => {
    if (resetSignal === 0) return;
    handleRef.current?.close();
    setEvents([]);
    setStreamError(null);
    setCopied(false);
  }, [resetSignal]);

  // Re-poll secret presence whenever the page mounts, whenever the user
  // returns from Settings (resetSignal), and whenever a session ends. The
  // *only* meaningful transition for is-streaming is `true → false` — we
  // skip the redundant call when streaming begins (the key didn't change).
  useEffect(() => {
    if (isStreaming) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const rows = await listSecrets();
        if (!cancelled) {
          setHasOpenAIKey(rows.some((r) => r.key === 'llm:openai'));
        }
      } catch {
        if (!cancelled) setHasOpenAIKey(false);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [resetSignal, isStreaming]);

  const onAnalyze = async () => {
    if (!engineReadyRef.current || isStreamingRef.current) return;
    setEvents([]);
    setStreamError(null);
    setCopied(false);
    isStreamingRef.current = true;
    setIsStreaming(true);
    try {
      // Resolve the provider config just-in-time. If the user pasted a key
      // in Settings, run the live debate; otherwise fall through to the stub.
      let providerConfig: ProviderConfig | undefined;
      try {
        const apiKey = await getSecret('llm:openai');
        if (apiKey) {
          providerConfig = {
            provider: 'openai',
            api_key: apiKey,
            model: 'gpt-4o-mini',
            max_tokens: 400,
          };
        }
      } catch {
        // If secret retrieval fails for any reason (encryption offline, etc.)
        // we silently fall back to the stub. The engine status banner already
        // surfaces the broken-encryption case.
      }

      const handle = await streamDebate(
        {
          ticker,
          trade_date: date,
          provider_config: providerConfig,
        },
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
      isStreamingRef.current = false;
      setIsStreaming(false);
    }
  };

  const onStop = () => {
    handleRef.current?.close();
  };

  // Listen for the App menu "Stop streaming" command.
  useEffect(() => {
    const bridge = window.tradingAgentsLab;
    if (!bridge?.onMenuCommand) return;
    return bridge.onMenuCommand('menu:stop-stream', () => {
      handleRef.current?.close();
    });
  }, []);

  // Page-level keyboard shortcuts:
  //   Cmd/Ctrl + Enter → run analysis
  //   Cmd/Ctrl + .     → stop streaming
  // (Cmd+, for Settings + Cmd+1..3 for nav are handled by the App menu.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (engineReadyRef.current && !isStreamingRef.current) onAnalyze();
      } else if (e.key === '.') {
        e.preventDefault();
        handleRef.current?.close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, date]);

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
              maxLength={8}
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
              max={new Date().toISOString().split('T')[0]}
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
            {engineStatus === 'running' && !isStreaming && hasOpenAIKey &&
              'Live debate — sequential calls to OpenAI gpt-4o-mini, capped per agent.'}
            {engineStatus === 'running' && !isStreaming && !hasOpenAIKey &&
              'Stub debate — paste an OpenAI key in Settings to switch to live agents.'}
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
            <span
              className={
                hasOpenAIKey ? styles.statusDotOk : styles.statusDotPending
              }
            />
            {hasOpenAIKey ? 'OpenAI · live' : 'Not configured'}
          </div>
          <div className={styles.statusHint}>
            {hasOpenAIKey
              ? 'gpt-4o-mini · sequential agent calls'
              : 'Settings → LLM Providers · stub debate until configured'}
          </div>
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
