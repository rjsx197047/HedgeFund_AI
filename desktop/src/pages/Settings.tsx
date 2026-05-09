import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './Settings.module.css';
import {
  deleteSecret,
  getAvailability,
  listSecrets,
  setSecret,
  type SecretListing,
  type SecretsAvailability,
} from '../lib/secrets';
import {
  disconnectOpenAIOAuth,
  getOpenAIOAuthStatus,
  onOAuthProgress,
  onOAuthPrompt,
  startOpenAIOAuthLogin,
  submitOAuthPromptResponse,
  type OAuthStatus,
} from '../lib/oauth';
import {
  getCostGuardState,
  updateCostGuardConfig,
  type CostGuardConfig,
  type SpendState,
} from '../lib/cost-guard';

type Tab = 'llm' | 'data' | 'clawless' | 'costguard' | 'about';

interface TabDef {
  id: Tab;
  label: string;
  description: string;
}

const TABS: TabDef[] = [
  {
    id: 'llm',
    label: 'LLM Providers',
    description:
      'Bring your own API key. OpenAI also supports OAuth (Anthropic API key only — OAuth is banned by their TOS).',
  },
  {
    id: 'data',
    label: 'Data Providers',
    description:
      'Where market data comes from. yfinance is the free default — no key required. Optionally connect Alpaca Markets for higher-quality real-time data.',
  },
  {
    id: 'clawless',
    label: 'Clawless',
    description:
      'Optional connector — route LLM calls through a Clawless gateway when one is reachable.',
  },
  {
    id: 'costguard',
    label: 'Cost Guard',
    description:
      'Daily / weekly / monthly USD caps + optional sessions-per-day rate cap. Applies to live LLM debates only — stub mode is always free.',
  },
  {
    id: 'about',
    label: 'About',
    description: 'Version, license, storage location, and project links.',
  },
];

interface SecretRow {
  /** Stable key in `secrets.json` — e.g. "llm:openai", "data:alpaca". */
  secretKey: string;
  /** Human label for the row. */
  name: string;
  /** Sub-line explaining the provider. */
  note: string;
  /** Pill content (no functional meaning yet). */
  pillLabel: string;
  pillVariant: 'default' | 'planned' | 'optional';
  /** Input affordance — `password` (default) or `text` for non-secret URLs. */
  fieldType?: 'password' | 'text';
  /** Placeholder for the input. */
  placeholder?: string;
}

const LLM_PROVIDERS: SecretRow[] = [
  {
    secretKey: 'llm:openai',
    name: 'OpenAI (API key fallback)',
    note: 'GPT-4o family via API key. The OAuth row above wins when both are configured — keep an API key here only if you want a manual fallback.',
    pillLabel: 'Fallback',
    pillVariant: 'optional',
    placeholder: 'sk-…',
  },
  {
    secretKey: 'llm:anthropic',
    name: 'Anthropic',
    note: 'Claude family. API key only — Anthropic OAuth is banned by their TOS.',
    pillLabel: 'API key only',
    pillVariant: 'default',
    placeholder: 'sk-ant-…',
  },
  {
    secretKey: 'llm:openrouter',
    name: 'OpenRouter',
    note: 'Provider-agnostic gateway. One key, many models — defaults to openai/gpt-4o-mini.',
    pillLabel: 'Compatible',
    pillVariant: 'default',
    placeholder: 'sk-or-…',
  },
  {
    secretKey: 'llm:gemini',
    name: 'Google Gemini',
    note: 'Gemini 2.0 Flash family. Cheap + fast — good for high-volume runs.',
    pillLabel: 'Compatible',
    pillVariant: 'default',
    placeholder: 'AIza…',
  },
];

// Alpaca auth requires TWO values — Key ID (sent as APCA-API-KEY-ID) and
// Secret Key (sent as APCA-API-SECRET-KEY). Both are minted together on the
// Alpaca dashboard; the Secret is shown only once at generation time.
//
// Per project positioning (locked 2026-05-09 — see CLAUDE.md §3 + memory):
// TradingAgentsLab is an analysis tool, not an execution platform. Alpaca
// is integrated for HIGH-QUALITY MARKET DATA only — not order execution.
// The engine's URL constants point to data.alpaca.markets and (read-only)
// paper-api.alpaca.markets. Live keys (api.alpaca.markets) have nowhere
// to go in our code: pasting a live key here will store it but the system
// will error out at request time. Defense-in-depth via endpoint constants,
// not a guard flag.
const DATA_PROVIDERS: SecretRow[] = [
  {
    secretKey: 'data:alpaca-key-id',
    name: 'Alpaca Markets — Key ID',
    note: 'Public key for high-quality market data (APCA-API-KEY-ID). Looks like PKxxxxxxxxxxxxxxxx. Paste alongside the Secret below. Use a paper-trading key — TradingAgentsLab connects only to data + paper-read endpoints; live keys will not function.',
    pillLabel: 'Key ID',
    pillVariant: 'default',
    placeholder: 'PKxxxxxxxxxxxxxxxx',
  },
  {
    secretKey: 'data:alpaca-secret',
    name: 'Alpaca Markets — Secret',
    note: 'Data secret (APCA-API-SECRET-KEY). Shown once at key generation on the Alpaca dashboard — regenerate the pair if you missed it.',
    pillLabel: 'Secret',
    pillVariant: 'default',
    placeholder: 'data secret key',
  },
];

const CLAWLESS_FIELDS: SecretRow[] = [
  {
    secretKey: 'clawless:gateway-url',
    name: 'Gateway URL',
    note: 'Default port for the OpenClaw gateway.',
    pillLabel: 'Connector',
    pillVariant: 'default',
    fieldType: 'text',
    placeholder: 'ws://127.0.0.1:18789',
  },
  {
    secretKey: 'clawless:gateway-token',
    name: 'Gateway token',
    note:
      'Grants broad read access — store via OS keychain only. Paste from your Clawless settings.',
    pillLabel: 'Connector',
    pillVariant: 'default',
    placeholder: 'paste from Clawless settings',
  },
];

function Settings() {
  const [active, setActive] = useState<Tab>('llm');
  const [availability, setAvailability] = useState<SecretsAvailability | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [listings, setListings] = useState<SecretListing[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAvailability()
      .then((info) => {
        if (cancelled) return;
        setAvailability(info);
        if (!info.available) {
          setAvailabilityError(
            'Encryption backend unavailable on this OS — refusing to store secrets in plaintext.',
          );
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAvailabilityError(
            err instanceof Error ? err.message : 'failed to check encryption availability',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!availability?.available) return;
    let cancelled = false;
    listSecrets()
      .then((rows) => {
        if (!cancelled) setListings(rows);
      })
      .catch(() => {
        if (!cancelled) setListings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [availability, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  const listingByKey = useMemo(() => {
    const map = new Map<string, SecretListing>();
    for (const l of listings) map.set(l.key, l);
    return map;
  }, [listings]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>
          Configure providers and connections. Secrets are encrypted by your OS
          keychain (macOS Keychain / Windows DPAPI / Linux libsecret) before they
          touch disk.
        </p>
      </header>

      {availabilityError && (
        <div className={styles.availabilityBanner}>
          <strong>Secret storage offline.</strong> {availabilityError}
        </div>
      )}

      <div className={styles.layout}>
        <nav className={styles.tabs} aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.tab} ${active === t.id ? styles.tabActive : ''}`}
              onClick={() => setActive(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{tab.label}</h2>
            <p className={styles.panelDescription}>{tab.description}</p>
          </header>

          {active === 'llm' && (
            <>
              <OpenAIOAuthRow disabled={!availability?.available} />
              <SecretRowList
                rows={LLM_PROVIDERS}
                listingByKey={listingByKey}
                disabled={!availability?.available}
                onChange={refresh}
              />
            </>
          )}
          {active === 'data' && (
            <>
              <YfinanceRow />
              <SecretRowList
                rows={DATA_PROVIDERS}
                listingByKey={listingByKey}
                disabled={!availability?.available}
                onChange={refresh}
              />
            </>
          )}
          {active === 'clawless' && (
            <SecretRowList
              rows={CLAWLESS_FIELDS}
              listingByKey={listingByKey}
              disabled={!availability?.available}
              onChange={refresh}
            />
          )}
          {active === 'costguard' && <CostGuardTab />}
          {active === 'about' && (
            <AboutTab availability={availability} secretsCount={listings.length} />
          )}
        </section>
      </div>
    </div>
  );
}

interface SecretRowListProps {
  rows: SecretRow[];
  listingByKey: Map<string, SecretListing>;
  disabled: boolean;
  onChange: () => void;
}

function SecretRowList({ rows, listingByKey, disabled, onChange }: SecretRowListProps) {
  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <SecretRowItem
          key={row.secretKey}
          row={row}
          listing={listingByKey.get(row.secretKey) ?? null}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </ul>
  );
}

interface SecretRowItemProps {
  row: SecretRow;
  listing: SecretListing | null;
  disabled: boolean;
  onChange: () => void;
}

function SecretRowItem({ row, listing, disabled, onChange }: SecretRowItemProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await setSecret(row.secretKey, value);
      setValue('');
      setEditing(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!listing) return;
    if (!confirm(`Delete stored value for ${row.name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSecret(row.secretKey);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowName}>{row.name}</div>
        <div className={styles.rowNote}>{row.note}</div>
        {listing && (
          <div className={styles.rowMeta}>
            Stored {row.fieldType === 'text' ? 'value' : 'key'}{' '}
            <span className={styles.hint}>{listing.hint}</span> · saved{' '}
            {formatRelative(listing.updatedAt)}
          </div>
        )}
        {editing && (
          <div className={styles.editor}>
            <input
              type={row.fieldType === 'text' ? 'text' : 'password'}
              className={styles.input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={row.placeholder ?? ''}
              autoFocus
              disabled={busy}
            />
            <div className={styles.editorActions}>
              <button
                className={styles.actionPrimary}
                onClick={onSave}
                disabled={busy || !value}
                type="button"
              >
                {busy ? 'Saving…' : listing ? 'Replace' : 'Save'}
              </button>
              <button
                className={styles.actionGhost}
                onClick={() => {
                  setEditing(false);
                  setValue('');
                  setError(null);
                }}
                disabled={busy}
                type="button"
              >
                Cancel
              </button>
            </div>
            {error && <div className={styles.editorError}>{error}</div>}
          </div>
        )}
      </div>
      <div className={styles.rowAside}>
        <span className={`${styles.pill} ${styles[`pill_${pillState(row, listing).variant}`]}`}>
          {pillState(row, listing).label}
        </span>
        {!editing && (
          <>
            <button
              className={styles.rowAction}
              onClick={() => setEditing(true)}
              disabled={disabled || busy}
              type="button"
            >
              {listing ? 'Replace' : 'Configure'}
            </button>
            {listing && (
              <button
                className={styles.rowActionDanger}
                onClick={onDelete}
                disabled={disabled || busy}
                type="button"
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function YfinanceRow() {
  return (
    <div className={styles.staticRow}>
      <div className={styles.rowMain}>
        <div className={styles.rowName}>Yahoo Finance</div>
        <div className={styles.rowNote}>
          Free historical OHLCV via the yfinance package. Default — no configuration
          needed; the engine is already using it.
        </div>
      </div>
      <div className={styles.rowAside}>
        <span className={`${styles.pill} ${styles.pill_success}`}>Active · default</span>
      </div>
    </div>
  );
}

interface OpenAIOAuthRowProps {
  disabled: boolean;
}

function OpenAIOAuthRow({ disabled }: OpenAIOAuthRowProps) {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ message: string; placeholder?: string } | null>(null);
  const [pasteValue, setPasteValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await getOpenAIOAuthStatus();
      setStatus(next);
    } catch (err) {
      setStatus({ connected: false });
      setError(err instanceof Error ? err.message : 'oauth status check failed');
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const offProgress = onOAuthProgress((event) => {
      setProgress(event.message);
    });
    const offPrompt = onOAuthPrompt((event) => {
      setPrompt({ message: event.message, placeholder: event.placeholder });
    });
    return () => {
      offProgress();
      offPrompt();
    };
  }, []);

  const onConnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    setProgress('Starting…');
    setPrompt(null);
    try {
      const result = await startOpenAIOAuthLogin();
      if (result.success) {
        setProgress(
          result.email
            ? `Connected as ${result.email}`
            : 'Connected.',
        );
      } else {
        setError(result.error ?? 'Login failed.');
        setProgress(null);
      }
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'oauth start failed');
      setProgress(null);
    } finally {
      setBusy(false);
      setPrompt(null);
      setPasteValue('');
    }
  }, [refreshStatus]);

  const onDisconnect = useCallback(async () => {
    if (!confirm('Disconnect the OpenAI account? Stored OAuth tokens will be erased.')) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectOpenAIOAuth();
      setProgress(null);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'disconnect failed');
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const onSubmitPaste = useCallback(() => {
    const value = pasteValue.trim();
    if (!value) return;
    submitOAuthPromptResponse(value);
    setPrompt(null);
    setPasteValue('');
  }, [pasteValue]);

  const connected = status?.connected ?? false;

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowName}>OpenAI account (OAuth)</div>
        <div className={styles.rowNote}>
          Sign in with your OpenAI account. Wins over the API key when both
          are configured. <strong>Note:</strong> whether OAuth tokens route
          through your ChatGPT subscription vs. per-token billing depends on
          your OpenAI account configuration — verify with a low-cost model
          first and check your billing dashboard before relying on this for
          cost savings.
        </div>
        {connected && (
          <div className={styles.rowMeta}>
            Connected{status?.email ? ` as ${status.email}` : ''}
            {status?.planType && ` · ${status.planType} plan`}
            {status?.needsRefresh && ' · token will refresh on next use'}
          </div>
        )}
        {connected && status?.isFreeTier && (
          <div className={styles.editorError} role="alert">
            ⚠ Free-tier ChatGPT accounts have unreliable Codex routing —
            many models hang or return errors. Configure an OpenAI API key
            below as a fallback if debates fail to start.
          </div>
        )}
        {progress && !error && (
          <div className={styles.rowMeta}>{progress}</div>
        )}
        {prompt && (
          <div className={styles.editor}>
            <div className={styles.label}>{prompt.message}</div>
            <input
              className={styles.input}
              value={pasteValue}
              onChange={(e) => setPasteValue(e.target.value)}
              placeholder={prompt.placeholder ?? 'paste here'}
              autoFocus
              disabled={busy && !prompt}
            />
            <div className={styles.editorActions}>
              <button
                className={styles.actionPrimary}
                onClick={onSubmitPaste}
                disabled={!pasteValue.trim()}
                type="button"
              >
                Submit
              </button>
            </div>
          </div>
        )}
        {error && <div className={styles.editorError}>{error}</div>}
      </div>
      <div className={styles.rowAside}>
        <span
          className={`${styles.pill} ${
            connected ? styles.pill_success : styles.pill_optional
          }`}
        >
          {connected ? 'Connected' : 'Recommended'}
        </span>
        {connected ? (
          <button
            className={styles.rowActionDanger}
            onClick={() => void onDisconnect()}
            disabled={disabled || busy}
            type="button"
          >
            Disconnect
          </button>
        ) : (
          <button
            className={styles.rowAction}
            onClick={() => void onConnect()}
            disabled={disabled || busy}
            type="button"
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}

interface AboutTabProps {
  availability: SecretsAvailability | null;
  secretsCount: number;
}

function AboutTab({ availability, secretsCount }: AboutTabProps) {
  return (
    <div className={styles.formCard}>
      <dl className={styles.aboutList}>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>Version</dt>
          <dd className={styles.aboutValue}>0.0.1</dd>
        </div>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>Phase</dt>
          <dd className={styles.aboutValue}>Phase 4 — secret storage + Settings UI</dd>
        </div>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>License</dt>
          <dd className={styles.aboutValue}>
            AGPL-3.0 (project additions) · Apache-2.0 (upstream tradingagents core)
          </dd>
        </div>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>Upstream</dt>
          <dd className={styles.aboutValue}>
            Forked from{' '}
            <a
              className={styles.link}
              href="https://github.com/TauricResearch/TradingAgents"
              target="_blank"
              rel="noreferrer"
            >
              TauricResearch/TradingAgents
            </a>
            <button
              type="button"
              className={styles.refreshLink}
              onClick={() => {
                const trigger = (window as unknown as { __talCheckUpstream?: () => void })
                  .__talCheckUpstream;
                if (trigger) trigger();
              }}
              style={{ marginLeft: 12 }}
            >
              Check for updates
            </button>
          </dd>
        </div>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>Repository</dt>
          <dd className={styles.aboutValue}>
            <a
              className={styles.link}
              href="https://github.com/jaysidd/TradingAgentsLab"
              target="_blank"
              rel="noreferrer"
            >
              jaysidd/TradingAgentsLab
            </a>
          </dd>
        </div>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>Posture</dt>
          <dd className={styles.aboutValue}>
            Educational research and paper trading. Not investment advice.
          </dd>
        </div>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>Encryption</dt>
          <dd className={styles.aboutValue}>
            {availability?.available
              ? 'OS keychain available · safeStorage active'
              : 'Unavailable — secret storage disabled'}
          </dd>
        </div>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>Secrets file</dt>
          <dd className={styles.aboutValue}>
            <code className={styles.code}>
              {availability?.filePath ?? '(unavailable)'}
            </code>
            <div className={styles.aboutHint}>
              {secretsCount === 0
                ? 'Empty — no secrets stored yet.'
                : `${secretsCount} entr${secretsCount === 1 ? 'y' : 'ies'} stored (encrypted).`}
            </div>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Pill state per row, applying the green-Connected convention from
 * commit `bdc1716` ("Green = wired and working right now") universally
 * to every SecretRowItem — not just OAuth + yfinance.
 *
 * Rules:
 * - listing != null AND pillVariant = 'planned' → "Stored · Inert" in the
 *   neutral optional style. Communicates "we have the key" without the
 *   green-confirming-active feel that would mislead on Restricted rows
 *   (e.g. Alpaca Live, where the engine refuses to place real-money
 *   orders even with keys configured).
 * - listing != null otherwise → "Connected ✓" in green pill_success.
 * - listing == null → static label/variant from the row definition.
 */
function pillState(
  row: SecretRow,
  listing: SecretListing | null,
): { label: string; variant: 'default' | 'planned' | 'optional' | 'success' } {
  if (!listing) {
    return { label: row.pillLabel, variant: row.pillVariant };
  }
  if (row.pillVariant === 'planned') {
    return { label: 'Stored · Inert', variant: 'optional' };
  }
  return { label: 'Connected ✓', variant: 'success' };
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ---- Cost Guard tab --------------------------------------------------------

function CostGuardTab() {
  const [config, setConfig] = useState<CostGuardConfig | null>(null);
  const [spend, setSpend] = useState<SpendState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form draft state — separate from `config` so the user can edit without
  // clobbering displayed-current values until they hit Save.
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [draftDaily, setDraftDaily] = useState('');
  const [draftWeekly, setDraftWeekly] = useState('');
  const [draftMonthly, setDraftMonthly] = useState('');
  const [draftSessionsPerDay, setDraftSessionsPerDay] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await getCostGuardState();
      setConfig(state.config);
      setSpend(state.spend);
      setDraftEnabled(state.config.enabled);
      setDraftDaily(String(state.config.cap_daily_usd));
      setDraftWeekly(String(state.config.cap_weekly_usd));
      setDraftMonthly(String(state.config.cap_monthly_usd));
      setDraftSessionsPerDay(String(state.config.cap_sessions_per_day));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load cost guard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateCostGuardConfig({
        enabled: draftEnabled,
        cap_daily_usd: parseNonNegFloat(draftDaily, config?.cap_daily_usd ?? 0),
        cap_weekly_usd: parseNonNegFloat(draftWeekly, config?.cap_weekly_usd ?? 0),
        cap_monthly_usd: parseNonNegFloat(draftMonthly, config?.cap_monthly_usd ?? 0),
        cap_sessions_per_day: parseNonNegInt(
          draftSessionsPerDay,
          config?.cap_sessions_per_day ?? 0,
        ),
      });
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // Refresh spend snapshot in case time crossed a window boundary.
      const state = await getCostGuardState();
      setSpend(state.spend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save cost guard');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config || !spend) {
    return (
      <div className={styles.formCard}>
        <p className={styles.formHint}>{error ?? 'Loading cost guard…'}</p>
      </div>
    );
  }

  return (
    <div className={styles.formCard}>
      <div className={styles.formGroup}>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={draftEnabled}
            onChange={(e) => setDraftEnabled(e.target.checked)}
          />
          <span>
            <strong>Budget caps enabled</strong>
            <div className={styles.formHint}>
              When off, all live debates are allowed regardless of caps.
            </div>
          </span>
        </label>
      </div>

      <fieldset className={styles.formGroup} disabled={!draftEnabled}>
        <legend className={styles.formLegend}>API cost caps (USD)</legend>
        <p className={styles.formHint}>
          Applies to API-key sessions only. OAuth sessions cost $0
          (subscription-billed). Set to 0 to disable any window.
        </p>
        <CostInputRow
          label="Daily"
          value={draftDaily}
          onChange={setDraftDaily}
          step={0.25}
          placeholder="1.00"
        />
        <CostInputRow
          label="Weekly"
          value={draftWeekly}
          onChange={setDraftWeekly}
          step={1}
          placeholder="5.00"
        />
        <CostInputRow
          label="Monthly"
          value={draftMonthly}
          onChange={setDraftMonthly}
          step={5}
          placeholder="15.00"
        />
      </fieldset>

      <fieldset className={styles.formGroup} disabled={!draftEnabled}>
        <legend className={styles.formLegend}>Session rate cap</legend>
        <p className={styles.formHint}>
          Applies to all live sessions including OAuth. Use this to cap your
          ChatGPT subscription quota usage. Set to 0 to disable.
        </p>
        <CostInputRow
          label="Per day"
          value={draftSessionsPerDay}
          onChange={setDraftSessionsPerDay}
          step={1}
          placeholder="0 (disabled)"
          asInteger
        />
      </fieldset>

      <fieldset className={styles.formGroup}>
        <legend className={styles.formLegend}>Current period spend</legend>
        <SpendBar
          label="Daily"
          current={spend.daily_usd}
          cap={config.cap_daily_usd}
        />
        <SpendBar
          label="Weekly"
          current={spend.weekly_usd}
          cap={config.cap_weekly_usd}
        />
        <SpendBar
          label="Monthly"
          current={spend.monthly_usd}
          cap={config.cap_monthly_usd}
        />
        {config.cap_sessions_per_day > 0 && (
          <SpendBar
            label="Sessions today"
            current={spend.sessions_today}
            cap={config.cap_sessions_per_day}
            isCount
          />
        )}
        <button
          type="button"
          className={styles.refreshLink}
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </fieldset>

      {error && <p className={styles.formError}>{error}</p>}
      {saved && <p className={styles.formSuccess}>Saved.</p>}

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.formSave}
          onClick={() => void onSave()}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

interface CostInputRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  placeholder?: string;
  asInteger?: boolean;
}

function CostInputRow({
  label,
  value,
  onChange,
  step = 0.25,
  placeholder,
  asInteger,
}: CostInputRowProps) {
  return (
    <div className={styles.costInputRow}>
      <label className={styles.costInputLabel}>
        {label}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={asInteger ? 1 : step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={styles.costInputField}
        />
      </label>
    </div>
  );
}

interface SpendBarProps {
  label: string;
  current: number;
  cap: number;
  isCount?: boolean;
}

function SpendBar({ label, current, cap, isCount }: SpendBarProps) {
  if (cap <= 0) {
    return (
      <div className={styles.spendRow}>
        <span className={styles.spendLabel}>{label}</span>
        <span className={styles.spendValue}>
          {isCount ? current : formatUsdShort(current)} · cap disabled
        </span>
      </div>
    );
  }
  const pct = Math.min(100, (current / cap) * 100);
  const tone = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
  return (
    <div className={styles.spendRow}>
      <span className={styles.spendLabel}>{label}</span>
      <div className={styles.spendProgress}>
        <div
          className={`${styles.spendBar} ${styles[`spendBar_${tone}`] ?? ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={styles.spendValue}>
        {isCount
          ? `${current} / ${cap}`
          : `${formatUsdShort(current)} / ${formatUsdShort(cap)}`}
      </span>
    </div>
  );
}

function parseNonNegFloat(raw: string, fallback: number): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function parseNonNegInt(raw: string, fallback: number): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function formatUsdShort(value: number): string {
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

export default Settings;
