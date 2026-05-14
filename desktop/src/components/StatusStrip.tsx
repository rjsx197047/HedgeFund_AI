/**
 * Compact status strip — always visible at the top of the app shell.
 *
 * Shows 4 pills (Engine / Data / LLM / Clawless) so the user can confirm
 * at a glance that nothing is failing or disconnected. Replaces the bulky
 * 4-card status grid that previously took up real estate at the top of the
 * Analyze page (founder feedback 2026-05-09).
 *
 * State sourcing:
 * - Engine: polls /health every 10s; pending → ok | error
 * - Data: seeded from /health, updated per-stream via window CustomEvent
 *         "tal:data-provider" dispatched by Analyze on data.summary events
 * - LLM: derived from secrets list — first-configured-wins per
 *        PROVIDER_PRIORITY (OpenAI OAuth wins over OpenAI API key when both)
 * - Clawless: derived from secrets — both gateway URL AND token present
 *             counts as "configured"; today's actual gateway probe is
 *             Phase 6 work so we just show "configured" or "disconnected"
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  PROVIDER_LABEL,
  PROVIDER_PRIORITY,
  PROVIDER_SECRET_KEY,
  getHealth,
  type LLMProvider,
} from '../lib/engine-client';
import { listSecrets } from '../lib/secrets';
import { getOpenAIOAuthStatus } from '../lib/oauth';
import styles from './StatusStrip.module.css';

const HEALTH_POLL_MS = 10_000;

// Custom-event channel Analyze (or any future page) uses to notify the
// strip of per-stream data-provider changes (alpaca · crypto, etc.).
export const DATA_PROVIDER_EVENT = 'tal:data-provider';

export interface DataProviderEventDetail {
  source: string;          // "yfinance" | "alpaca" | ...
  asset_class?: 'equity' | 'crypto';
}

type PillState = 'ok' | 'warn' | 'error' | 'off' | 'pending';

interface PillProps {
  label: string;
  detail?: string;
  state: PillState;
  title?: string;
}

function Pill({ label, detail, state, title }: PillProps) {
  return (
    <span
      className={`${styles.pill} ${styles[`pill_${state}`]}`}
      title={title ?? `${label}${detail ? `: ${detail}` : ''}`}
    >
      <span className={styles.dot} />
      <span className={styles.label}>{label}</span>
      {detail && <span className={styles.detail}>{detail}</span>}
    </span>
  );
}

function StatusStrip() {
  const [engineState, setEngineState] = useState<PillState>('pending');
  const [engineError, setEngineError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string | null>(null);
  const [dataAssetClass, setDataAssetClass] = useState<'equity' | 'crypto' | null>(null);
  const [llmProvider, setLlmProvider] = useState<LLMProvider | null>(null);
  const [llmIsOauth, setLlmIsOauth] = useState(false);
  const [clawlessConfigured, setClawlessConfigured] = useState(false);

  // ---- Engine health polling ---------------------------------------------
  //
  // Engine startup is racy — Vite renders the React app before the Python
  // sidecar has emitted its handshake JSON. We don't want to flash a red
  // "Engine error" pill for the 1-3s it takes the engine to come up. So:
  //   1. Stay in 'pending' (pulsing dot) on every failure UNTIL we've
  //      seen at least one success OR the grace window has elapsed
  //   2. After grace window: show 'error'
  //   3. After first success: subsequent failures DO show 'error' fast
  //      (we know engine was alive — failure now is a real signal)
  const STARTUP_GRACE_MS = 12_000;
  const everSucceededRef = useRef(false);
  const mountedAtRef = useRef<number>(Date.now());

  const pollHealth = useCallback(async () => {
    try {
      const h = await getHealth();
      everSucceededRef.current = true;
      setEngineState('ok');
      setEngineError(null);
      // Initial seed only — per-stream Alpaca/crypto routing comes via
      // the CustomEvent below. Don't override an event-set source.
      setDataSource((cur) => cur ?? h.data_provider ?? null);
    } catch (err) {
      const elapsed = Date.now() - mountedAtRef.current;
      const stillStarting = !everSucceededRef.current && elapsed < STARTUP_GRACE_MS;
      setEngineState(stillStarting ? 'pending' : 'error');
      setEngineError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    // Tight retry cadence during the startup grace window so we transition
    // pending→ok within 1-2s of the engine becoming ready, not 10s+.
    void pollHealth();
    const fastInterval = setInterval(() => {
      if (everSucceededRef.current) return;
      void pollHealth();
    }, 1000);
    const slowInterval = setInterval(() => void pollHealth(), HEALTH_POLL_MS);
    // Stop the fast retry once we've succeeded once (or grace expires).
    const stopFastTimeout = setTimeout(
      () => clearInterval(fastInterval),
      STARTUP_GRACE_MS,
    );
    return () => {
      clearInterval(fastInterval);
      clearInterval(slowInterval);
      clearTimeout(stopFastTimeout);
    };
  }, [pollHealth]);

  // ---- Data-provider per-stream override (Analyze dispatches) ------------

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<DataProviderEventDetail>;
      const detail = ce.detail;
      if (detail?.source) setDataSource(detail.source);
      if (detail?.asset_class) setDataAssetClass(detail.asset_class);
    };
    window.addEventListener(DATA_PROVIDER_EVENT, handler as EventListener);
    return () => window.removeEventListener(DATA_PROVIDER_EVENT, handler as EventListener);
  }, []);

  // ---- LLM + Clawless from secrets ---------------------------------------

  const refreshSecrets = useCallback(async () => {
    try {
      const [secrets, oauthStatus] = await Promise.all([
        listSecrets(),
        getOpenAIOAuthStatus().catch(() => null),
      ]);
      const stored = new Set(secrets.map((s) => s.key));

      // OpenAI special case: OAuth wins over API key when both are present.
      let resolved: LLMProvider | null = null;
      let oauth = false;
      if (oauthStatus?.connected) {
        resolved = 'openai';
        oauth = true;
      } else {
        for (const p of PROVIDER_PRIORITY) {
          // Local needs BOTH `local:base-url` and `local:model` to count
          // as configured. Single-key check (the default branch) would
          // over-report local as ready when only the URL is saved.
          if (p === 'local') {
            if (
              stored.has(PROVIDER_SECRET_KEY.local) &&
              stored.has('local:model')
            ) {
              resolved = p;
              break;
            }
            continue;
          }
          if (stored.has(PROVIDER_SECRET_KEY[p])) {
            resolved = p;
            break;
          }
        }
      }
      setLlmProvider(resolved);
      setLlmIsOauth(oauth);

      // Clawless requires BOTH the URL and the token. Today's wiring is
      // pre-Phase-6 so we don't actually probe — just check storage.
      const hasUrl = stored.has('clawless:gateway-url');
      const hasToken = stored.has('clawless:gateway-token');
      setClawlessConfigured(hasUrl && hasToken);
    } catch {
      // safeStorage offline — leave previous values as-is
    }
  }, []);

  useEffect(() => {
    void refreshSecrets();
    // Re-resolve if the user updates secrets in another tab. We can't
    // listen for safeStorage writes directly; poll lightly.
    const id = setInterval(() => void refreshSecrets(), 30_000);
    return () => clearInterval(id);
  }, [refreshSecrets]);

  // ---- Render ------------------------------------------------------------

  // Engine pill — during startup grace window, pending reads as "starting"
  // (with a short detail label visible) so the user has positive context
  // rather than a silent dot. Once running, the dot alone communicates state.
  const enginePill = (
    <Pill
      label="Engine"
      detail={engineState === 'pending' ? 'starting…' : undefined}
      state={engineState}
      title={
        engineState === 'error'
          ? `Engine error: ${engineError ?? 'unknown'}`
          : engineState === 'pending'
            ? 'Engine starting — waiting for Python sidecar handshake'
            : 'Python sidecar running'
      }
    />
  );

  // Data pill — green when any source resolved; pending otherwise
  const dataDetail = dataSource
    ? dataAssetClass === 'crypto'
      ? `${dataSource} · crypto`
      : dataSource
    : 'pending';
  const dataPill = (
    <Pill
      label="Data"
      detail={dataDetail}
      state={dataSource ? 'ok' : 'pending'}
      title={
        dataSource
          ? `Data provider: ${dataDetail}`
          : 'Waiting for engine handshake'
      }
    />
  );

  // LLM pill
  const llmDetail = llmProvider
    ? llmIsOauth
      ? 'OpenAI · OAuth'
      : PROVIDER_LABEL[llmProvider]
    : 'unconfigured';
  const llmPill = (
    <Pill
      label="LLM"
      detail={llmDetail}
      state={llmProvider ? 'ok' : 'off'}
      title={
        llmProvider
          ? `Active provider: ${llmDetail}`
          : 'No LLM provider configured — debates will run as stub'
      }
    />
  );

  // Clawless pill — gray since Phase 6 (real probe) hasn't shipped
  const clawlessPill = (
    <Pill
      label="Clawless"
      detail={clawlessConfigured ? 'configured' : 'disconnected'}
      state={clawlessConfigured ? 'warn' : 'off'}
      title={
        clawlessConfigured
          ? 'Clawless gateway credentials stored — Phase 6 will activate the connector'
          : 'Optional connector — not configured'
      }
    />
  );

  return (
    <div className={styles.strip}>
      {enginePill}
      {dataPill}
      {llmPill}
      {clawlessPill}
    </div>
  );
}

export default StatusStrip;
