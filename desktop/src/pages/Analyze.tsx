import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './Analyze.module.css';
import DebateStream from '../components/DebateStream';
import { CostGuardModal, type OverDimension } from '../components/CostGuardModal';
import {
  getHandshake,
  getHealth,
  streamDebate,
  type DebateEvent,
  type LLMProvider,
  type ProviderConfig,
  type StreamHandle,
  getAvailableModels,
  getModelStorageKey,
  getRecommendedModel,
  PROVIDER_LABEL,
  PROVIDER_PRIORITY,
  PROVIDER_SECRET_KEY,
} from '../lib/engine-client';
import {
  CostGuardBlocked,
  reserveCostGuard,
  type CostGuardConfig,
  type SpendState,
} from '../lib/cost-guard';
import { buildTranscriptMarkdown } from '../lib/transcript';
import { getSecret, listSecrets } from '../lib/secrets';
import { consumePendingTicker } from '../lib/handoff';
import {
  getOpenAICredentialsForRequest,
  getOpenAIOAuthStatus,
} from '../lib/oauth';

/** Persists the dropdown choice across app sessions (per founder, 2026-05-09). */
const SELECTED_PROVIDER_STORAGE_KEY = 'tal:analyze:selected-provider';

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
  /** Per-stream asset class set from the latest data.summary event. Used to
   * surface a "crypto" badge on the Data card so users can confirm the
   * engine routed to the crypto endpoint, not the equities one. */
  const [assetClass, setAssetClass] = useState<'equity' | 'crypto' | null>(null);
  const [events, setEvents] = useState<DebateEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /**
   * Set of providers the user has configured (any auth flow). Drives both
   * the dropdown's enabled/disabled state and the priority resolver
   * fallback when no manual selection is saved.
   */
  const [configuredProviders, setConfiguredProviders] = useState<Set<LLMProvider>>(
    () => new Set(),
  );
  /**
   * The user's *manual* dropdown choice (persisted to localStorage). null
   * means "use the priority resolver" — the dropdown still pre-fills with
   * the resolver's pick so the user can see what's about to run.
   */
  const [manualProvider, setManualProvider] = useState<LLMProvider | null>(() => {
    try {
      const raw = localStorage.getItem(SELECTED_PROVIDER_STORAGE_KEY);
      if (raw && (PROVIDER_PRIORITY as readonly string[]).includes(raw)) {
        return raw as LLMProvider;
      }
    } catch {
      // localStorage can throw in private mode — fall through.
    }
    return null;
  });
  /**
   * Whether OpenAI auth resolves to OAuth (subscription plan) vs API key.
   * Internal to the OpenAI provider — OAuth wins when both are stored.
   * Surfaced in the LLM status hint so the founder can see which billing
   * path the next debate will hit when the active provider is OpenAI.
   */
  const [openaiAuthKind, setOpenaiAuthKind] = useState<'oauth' | 'api_key' | null>(null);

  /**
   * CostGuard override modal state. When `blocked` is non-null, the modal
   * is open and the user must Cancel or Override before the debate runs.
   * The Promise resolver lets the async onAnalyze flow await the user's
   * choice without resorting to event-based callback gymnastics.
   */
  const [costGuardBlocked, setCostGuardBlocked] = useState<{
    over_dimension: OverDimension;
    spend: SpendState;
    config: CostGuardConfig;
    est_cost_usd: number;
  } | null>(null);
  const costGuardResolverRef = useRef<((proceed: boolean) => void) | null>(null);

  /**
   * The provider that will actually run the next debate, after considering
   * (a) the user's manual dropdown choice and (b) the priority resolver.
   * Stays in sync with `configuredProviders` and `manualProvider` via
   * `useMemo` rather than living in its own state — single source of truth.
   */
  const activeProvider = useMemo<LLMProvider | null>(() => {
    if (manualProvider && configuredProviders.has(manualProvider)) {
      return manualProvider;
    }
    return (
      PROVIDER_PRIORITY.find((p) => configuredProviders.has(p)) ?? null
    );
  }, [manualProvider, configuredProviders]);

  // Ref mirrors of the resolution state. `onAnalyze` is async (multiple
  // awaits between mousedown and the WS open frame) — reading via refs
  // means a Settings-driven state change racing with a click can't leave
  // the request using a now-stale provider/auth combo. Same pattern as
  // `isStreamingRef`/`engineReadyRef` above.
  const activeProviderRef = useRef<LLMProvider | null>(null);
  const openaiAuthKindRef = useRef<'oauth' | 'api_key' | null>(null);
  useEffect(() => {
    activeProviderRef.current = activeProvider;
  }, [activeProvider]);
  useEffect(() => {
    openaiAuthKindRef.current = openaiAuthKind;
  }, [openaiAuthKind]);

  /**
   * Available models for the current provider+auth combo. Recomputed
   * whenever the active provider or OpenAI auth flow changes.
   */
  const availableModels = useMemo(() => {
    if (!activeProvider) return [];
    return getAvailableModels(activeProvider, openaiAuthKind);
  }, [activeProvider, openaiAuthKind]);

  /**
   * The model that will run the next debate. Pulls from per-(provider,auth)
   * localStorage memory if the user picked one before; falls back to the
   * recommended entry. Validates against the current available list — if
   * the saved id no longer exists in the registry (model deprecated), we
   * drop it and use the recommendation.
   */
  const [activeModel, setActiveModel] = useState<string | null>(null);

  // Resync the model selection whenever the (provider, authKind) tuple
  // changes. Reads from localStorage; falls back to recommended.
  useEffect(() => {
    if (!activeProvider) {
      setActiveModel(null);
      return;
    }
    const key = getModelStorageKey(activeProvider, openaiAuthKind);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key);
    } catch {
      // ignore
    }
    const inList = saved && availableModels.some((m) => m.id === saved);
    setActiveModel(inList ? saved : getRecommendedModel(activeProvider, openaiAuthKind));
  }, [activeProvider, openaiAuthKind, availableModels]);

  /** Ref mirror so onAnalyze sees the right model under racing state. */
  const activeModelRef = useRef<string | null>(null);
  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);

  const onSelectModel = useCallback(
    (modelId: string) => {
      if (!activeProvider) return;
      setActiveModel(modelId);
      try {
        const key = getModelStorageKey(activeProvider, openaiAuthKind);
        localStorage.setItem(key, modelId);
      } catch {
        // ignore
      }
    },
    [activeProvider, openaiAuthKind],
  );
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
        // Seed from /health (the engine's default — usually yfinance). The
        // data.summary event handler below overrides this per-debate when
        // the user has Alpaca configured (engine reports actual source on
        // each fetch).
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

  // Reflect the actual data provider + asset class used per stream. The
  // engine emits source ("yfinance" | "alpaca") and asset_class ("equity"
  // | "crypto") on every data.summary event. The /health seed only knows
  // the engine's default provider; per-stream routing + asset class show up
  // here once the first data.summary arrives.
  useEffect(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const evt = events[i];
      if (evt.type === 'data.summary') {
        const src = (evt as { source?: string }).source;
        const ac = (evt as { asset_class?: 'equity' | 'crypto' }).asset_class;
        if (src && src !== dataProvider) setDataProvider(src);
        if (ac && ac !== assetClass) setAssetClass(ac);
        break;
      }
    }
  }, [events, dataProvider, assetClass]);

  // Reset state when the menu fires "New analysis".
  useEffect(() => {
    if (resetSignal === 0) return;
    handleRef.current?.close();
    setEvents([]);
    setStreamError(null);
    setCopied(false);
  }, [resetSignal]);

  // Re-poll secret presence + OAuth status whenever the page mounts, when
  // the user returns from Settings (resetSignal), and when a session ends.
  // The *only* meaningful transition for is-streaming is `true → false` —
  // skip the redundant call when streaming begins (the key set didn't
  // change). Updates `configuredProviders` (drives the dropdown) and
  // `openaiAuthKind` (drives the OAuth-vs-API-key hint).
  useEffect(() => {
    if (isStreaming) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const [rows, oauth] = await Promise.all([
          listSecrets(),
          getOpenAIOAuthStatus().catch(() => ({ connected: false } as const)),
        ]);
        if (cancelled) return;
        const stored = new Set(rows.map((r) => r.key));
        const next = new Set<LLMProvider>();
        for (const p of PROVIDER_PRIORITY) {
          const hasKey = stored.has(PROVIDER_SECRET_KEY[p]);
          if (p === 'openai' && (oauth.connected || hasKey)) next.add(p);
          else if (p !== 'openai' && hasKey) next.add(p);
        }
        setConfiguredProviders(next);
        // OAuth wins over API key when both are present (founder
        // preference). Surfaced when openai is the active provider.
        setOpenaiAuthKind(
          oauth.connected
            ? 'oauth'
            : stored.has(PROVIDER_SECRET_KEY.openai)
              ? 'api_key'
              : null,
        );
      } catch {
        if (!cancelled) {
          setConfiguredProviders(new Set());
          setOpenaiAuthKind(null);
        }
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [resetSignal, isStreaming]);

  // When the saved manual choice no longer has credentials (user deleted
  // the key in Settings), drop it so the priority resolver takes over.
  // localStorage stays in sync — a stale key shouldn't survive across
  // app launches once we know it's invalid.
  useEffect(() => {
    if (manualProvider && !configuredProviders.has(manualProvider)) {
      setManualProvider(null);
      try {
        localStorage.removeItem(SELECTED_PROVIDER_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [manualProvider, configuredProviders]);

  const onSelectProvider = useCallback((value: LLMProvider | '') => {
    if (value === '') {
      // "Auto" sentinel — clear the manual override and let priority resolver win.
      setManualProvider(null);
      try {
        localStorage.removeItem(SELECTED_PROVIDER_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }
    setManualProvider(value);
    try {
      localStorage.setItem(SELECTED_PROVIDER_STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }, []);

  /**
   * Reset BOTH provider and model overrides. Provider falls back to the
   * priority resolver; model falls back to the recommended entry for
   * whatever provider then resolves. Per-provider model memories in
   * localStorage are also cleared so "Reset" really means "give me the
   * recommended setup."
   *
   * Reads the current provider/auth via refs so the callback's identity
   * doesn't churn on every state change AND doesn't capture stale state
   * if the user changed providers between renders. Reset of `activeModel`
   * has to happen explicitly here — the sync effect at line ~132 only
   * re-fires when `[activeProvider, openaiAuthKind, availableModels]`
   * changes, so a model-only reset (provider unchanged) wouldn't trigger
   * it on its own.
   */
  const onResetOverrides = useCallback(() => {
    setManualProvider(null);
    try {
      localStorage.removeItem(SELECTED_PROVIDER_STORAGE_KEY);
      // Clear per-(provider,auth) model memories.
      for (const p of PROVIDER_PRIORITY) {
        localStorage.removeItem(getModelStorageKey(p, null));
        if (p === 'openai') {
          localStorage.removeItem(getModelStorageKey('openai', 'oauth'));
        }
      }
    } catch {
      // ignore
    }
    // Snap the in-memory model state back to the recommendation for the
    // currently-resolved provider so a model-only override clears
    // immediately (not only after the next provider/auth change).
    const provider = activeProviderRef.current;
    const authKind = openaiAuthKindRef.current;
    if (provider) {
      setActiveModel(getRecommendedModel(provider, authKind));
    } else {
      setActiveModel(null);
    }
  }, []);

  const onAnalyze = async () => {
    if (!engineReadyRef.current || isStreamingRef.current) return;
    setEvents([]);
    setStreamError(null);
    setCopied(false);
    // Reset asset class so the previous run's "crypto" badge doesn't bleed
    // into a new equity analysis (or vice versa) before the first
    // data.summary event arrives. dataProvider stays as-is — it's the
    // engine default until overridden.
    setAssetClass(null);
    isStreamingRef.current = true;
    setIsStreaming(true);
    try {
      // Resolve the provider config just-in-time. If a key is configured for
      // any provider in PROVIDER_PRIORITY, run the live debate; otherwise
      // fall through to the stub.
      //
      // OpenAI special case: prefer OAuth (subscription plan) when both
      // OAuth tokens AND an API key are stored. The main-process service
      // silently refreshes the access token if it's within 60s of expiry.
      // Snapshot the resolved provider + OpenAI auth flow + model at
      // click-time through the refs — guards against a Settings-tab
      // state change racing with the multiple awaits inside this async
      // handler.
      const provider = activeProviderRef.current;
      const authKind = openaiAuthKindRef.current;
      const model =
        activeModelRef.current ??
        (provider ? getRecommendedModel(provider, authKind) : '');
      let providerConfig: ProviderConfig | undefined;
      try {
        if (provider === 'openai') {
          if (authKind === 'oauth') {
            const creds = await getOpenAICredentialsForRequest();
            if (creds) {
              providerConfig = {
                provider: 'openai',
                auth: {
                  type: 'oauth',
                  access: creds.access,
                  refresh: creds.refresh,
                  expires: creds.expires,
                  account_id: creds.accountId,
                },
                model,
                max_tokens: 400,
              };
            }
          }
          if (!providerConfig) {
            const apiKey = await getSecret(PROVIDER_SECRET_KEY.openai);
            if (apiKey) {
              providerConfig = {
                provider: 'openai',
                auth: { type: 'api_key', api_key: apiKey },
                model,
                max_tokens: 400,
              };
            }
          }
        } else if (provider) {
          const apiKey = await getSecret(PROVIDER_SECRET_KEY[provider]);
          if (apiKey) {
            providerConfig = {
              provider,
              auth: { type: 'api_key', api_key: apiKey },
              model,
              max_tokens: 400,
            };
          }
        }
      } catch {
        // If secret retrieval fails for any reason (encryption offline, etc.)
        // we silently fall back to the stub. The engine status banner already
        // surfaces the broken-encryption case.
      }

      // Build optional data_config for the WS start frame. When the user has
      // BOTH Alpaca Markets credentials configured, the engine instantiates
      // a per-stream AlpacaProvider for this debate's data fetches. Either
      // missing → engine falls through to its yfinance default. No fallback
      // chain on Alpaca failure: if user configured Alpaca and a request
      // errors, the data card stays empty so they notice (silent fallback
      // would mask configuration issues).
      let dataConfig: { provider: 'alpaca'; key_id: string; secret: string } | undefined;
      try {
        const [alpacaKeyId, alpacaSecret] = await Promise.all([
          getSecret('data:alpaca-key-id'),
          getSecret('data:alpaca-secret'),
        ]);
        if (alpacaKeyId && alpacaSecret) {
          dataConfig = {
            provider: 'alpaca',
            key_id: alpacaKeyId,
            secret: alpacaSecret,
          };
        }
      } catch {
        // safeStorage offline — fall through to yfinance default.
      }

      // CostGuard reservation gate. Only applies to live debates — stub
      // mode (no providerConfig) skips the gate entirely on both sides.
      // We try the reservation, and if it fails with CostGuardBlocked we
      // open the modal and await the user's choice. Cancel returns early;
      // Override re-tries with override=true.
      let reservationId: string | undefined;
      if (providerConfig) {
        const auth_kind = providerConfig.auth.type;
        // ProviderConfig.model and max_tokens are typed optional; both are
        // populated above when we built the config, so default safely.
        const cgModel = providerConfig.model ?? '';
        const cgMaxTokens = providerConfig.max_tokens ?? 400;
        try {
          const reservation = await reserveCostGuard({
            model: cgModel,
            auth_kind,
            max_tokens: cgMaxTokens,
          });
          reservationId = reservation.reservation_id;
        } catch (err) {
          if (err instanceof CostGuardBlocked) {
            // Open the modal and wait for the user's decision.
            const proceed = await new Promise<boolean>((resolve) => {
              costGuardResolverRef.current = resolve;
              setCostGuardBlocked({
                over_dimension: err.over_dimension,
                spend: err.spend,
                config: err.config,
                est_cost_usd: err.est_cost_usd,
              });
            });
            if (!proceed) {
              // User cancelled — abort cleanly with a friendly message.
              setStreamError(
                `Cost guard: ${err.over_dimension} cap reached. Adjust caps in Settings or override at run time.`,
              );
              return;
            }
            // User overrode — reserve again with override=true.
            const reservation = await reserveCostGuard({
              model: cgModel,
              auth_kind,
              max_tokens: cgMaxTokens,
              override: true,
            });
            reservationId = reservation.reservation_id;
          } else {
            // Unexpected error from /cost-guard/reserve. Surface and abort.
            setStreamError(
              err instanceof Error ? err.message : 'cost guard reserve failed',
            );
            return;
          }
        }
      }

      const handle = await streamDebate(
        {
          ticker,
          trade_date: date,
          provider_config: providerConfig,
          reservation_id: reservationId,
          data_config: dataConfig,
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

  const onCostGuardConfirm = useCallback(() => {
    setCostGuardBlocked(null);
    costGuardResolverRef.current?.(true);
    costGuardResolverRef.current = null;
  }, []);

  const onCostGuardCancel = useCallback(() => {
    setCostGuardBlocked(null);
    costGuardResolverRef.current?.(false);
    costGuardResolverRef.current = null;
  }, []);

  return (
    <div className={styles.page}>
      {costGuardBlocked && (
        <CostGuardModal
          overDimension={costGuardBlocked.over_dimension}
          spend={costGuardBlocked.spend}
          config={costGuardBlocked.config}
          estCostUsd={costGuardBlocked.est_cost_usd}
          onConfirm={onCostGuardConfirm}
          onCancel={onCostGuardCancel}
        />
      )}
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderTitleBlock}>
          <h1 className={styles.pageTitle}>Analyze</h1>
          <p className={styles.pageSubtitle}>
            Run a multi-agent analysis of a ticker on a specific date. The
            analyst, researcher, trader, and risk-manager agents debate and
            produce a recommendation.
          </p>
        </div>
        <div className={styles.pageHeaderProvider}>
          <label className={styles.providerLabel} htmlFor="run-with">
            Run with
          </label>
          <select
            id="run-with"
            className={styles.providerSelect}
            value={activeProvider ?? ''}
            onChange={(e) => onSelectProvider(e.target.value as LLMProvider | '')}
            disabled={isStreaming || engineStatus !== 'running'}
          >
            {PROVIDER_PRIORITY.map((p) => {
              const configured = configuredProviders.has(p);
              const isOpenAIOAuth = p === 'openai' && openaiAuthKind === 'oauth';
              const label = configured
                ? `${PROVIDER_LABEL[p]}${isOpenAIOAuth ? ' (OAuth)' : ''}`
                : `${PROVIDER_LABEL[p]} — configure in Settings`;
              return (
                <option key={p} value={p} disabled={!configured}>
                  {label}
                </option>
              );
            })}
            {configuredProviders.size === 0 && (
              <option value="" disabled>
                Stub debate — no LLM configured
              </option>
            )}
          </select>
          {activeProvider && availableModels.length > 0 && (
            <select
              className={styles.providerSelect}
              value={activeModel ?? ''}
              onChange={(e) => onSelectModel(e.target.value)}
              disabled={isStreaming || engineStatus !== 'running'}
              aria-label="Select model"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.recommended ? ' (recommended)' : ''}
                  {m.note ? ` — ${m.note}` : ''}
                </option>
              ))}
            </select>
          )}
          {(manualProvider ||
            (activeProvider &&
              activeModel !== null &&
              activeModel !== getRecommendedModel(activeProvider, openaiAuthKind))) && (
            <button
              type="button"
              className={styles.providerReset}
              onClick={onResetOverrides}
              disabled={isStreaming}
              title="Reset provider and model to recommended defaults"
              aria-label="Reset provider and model to recommended defaults"
            >
              Reset
            </button>
          )}
        </div>
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
            {engineStatus === 'running' && !isStreaming && activeProvider && activeModel &&
              `Live debate — ${PROVIDER_LABEL[activeProvider]}${openaiAuthKind === 'oauth' && activeProvider === 'openai' ? ' (OAuth)' : ''} · ${activeModel}, capped per agent.`}
            {engineStatus === 'running' && !isStreaming && !activeProvider &&
              'Stub debate — paste an LLM key in Settings to switch to live agents.'}
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
          <div className={styles.statusHint}>Python sidecar · live or stub</div>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusLabel}>Data</div>
          <div className={styles.statusValue}>
            <span
              className={
                dataProvider ? styles.statusDotOk : styles.statusDotPending
              }
            />
            {dataProvider
              ? `${dataProvider}${assetClass === 'crypto' ? ' · crypto' : ''} · live`
              : 'Pending…'}
          </div>
          <div className={styles.statusHint}>
            {dataProvider === 'alpaca'
              ? assetClass === 'crypto'
                ? 'Alpaca crypto feed · v1beta3'
                : 'Alpaca Markets · SIP feed (15-min delayed)'
              : dataProvider === 'yfinance'
                ? assetClass === 'crypto'
                  ? 'Yahoo Finance · crypto pair'
                  : 'Yahoo Finance · free · default'
                : 'yfinance default · Alpaca optional'}
          </div>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusLabel}>LLM</div>
          <div className={styles.statusValue}>
            <span
              className={
                activeProvider ? styles.statusDotOk : styles.statusDotPending
              }
            />
            {activeProvider
              ? `${PROVIDER_LABEL[activeProvider]} · live`
              : 'Not configured'}
          </div>
          <div className={styles.statusHint}>
            {activeProvider && activeModel
              ? `${openaiAuthKind === 'oauth' && activeProvider === 'openai' ? 'OAuth · ' : ''}${activeModel} · sequential agent calls`
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
