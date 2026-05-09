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

type Tab = 'llm' | 'data' | 'broker' | 'clawless' | 'about';

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
      'Where market data comes from. yfinance is the free default — no key required.',
  },
  {
    id: 'broker',
    label: 'Broker',
    description:
      'Where paper-trade orders are placed. Live trading is gated behind explicit confirmation.',
  },
  {
    id: 'clawless',
    label: 'Clawless',
    description:
      'Optional connector — route LLM calls through a Clawless gateway when one is reachable.',
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
    name: 'OpenAI',
    note: 'GPT-4o family. API key today; OAuth lands in a follow-up commit.',
    pillLabel: 'Recommended',
    pillVariant: 'default',
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

const DATA_PROVIDERS: SecretRow[] = [
  {
    secretKey: 'data:alpaca',
    name: 'Alpaca Markets',
    note: 'IEX/SIP feed for power users. The same key powers the Alpaca broker.',
    pillLabel: 'Optional',
    pillVariant: 'optional',
    placeholder: 'PK…',
  },
];

const BROKERS: SecretRow[] = [
  {
    secretKey: 'broker:alpaca-paper',
    name: 'Alpaca Paper Trading',
    note: 'Default. Paper-only — no real-money risk.',
    pillLabel: 'Default',
    pillVariant: 'default',
    placeholder: 'paper API key',
  },
  {
    secretKey: 'broker:alpaca-live',
    name: 'Alpaca Live',
    note:
      'Real-money trading. Restricted in this distribution; configuration intentionally inert.',
    pillLabel: 'Restricted',
    pillVariant: 'planned',
    placeholder: 'live API key (disabled)',
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
            <SecretRowList
              rows={LLM_PROVIDERS}
              listingByKey={listingByKey}
              disabled={!availability?.available}
              onChange={refresh}
            />
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
          {active === 'broker' && (
            <SecretRowList
              rows={BROKERS}
              listingByKey={listingByKey}
              disabled={!availability?.available}
              onChange={refresh}
            />
          )}
          {active === 'clawless' && (
            <SecretRowList
              rows={CLAWLESS_FIELDS}
              listingByKey={listingByKey}
              disabled={!availability?.available}
              onChange={refresh}
            />
          )}
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
        <span className={`${styles.pill} ${styles[`pill_${row.pillVariant}`]}`}>
          {row.pillLabel}
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
        <span className={`${styles.pill} ${styles.pill_default}`}>Active · default</span>
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

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default Settings;
