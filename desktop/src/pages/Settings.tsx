import { useState } from 'react';
import styles from './Settings.module.css';

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
    description: 'Bring your own API key. OpenAI also supports OAuth (Anthropic API key only).',
  },
  {
    id: 'data',
    label: 'Data Providers',
    description: 'Where market data comes from for analysis.',
  },
  {
    id: 'broker',
    label: 'Broker',
    description: 'Where paper-trade orders are placed. Live trading is gated behind explicit confirmation.',
  },
  {
    id: 'clawless',
    label: 'Clawless',
    description: 'Optional connector — route LLM calls through a Clawless gateway when available.',
  },
  {
    id: 'about',
    label: 'About',
    description: 'Version, license, and project links.',
  },
];

interface ProviderRow {
  id: string;
  name: string;
  note: string;
  pillLabel: string;
  pillVariant: 'default' | 'planned' | 'optional';
}

const LLM_PROVIDERS: ProviderRow[] = [
  { id: 'openai', name: 'OpenAI', note: 'GPT-4 family. API key or OAuth.', pillLabel: 'Recommended', pillVariant: 'default' },
  { id: 'anthropic', name: 'Anthropic', note: 'Claude family. API key only — Anthropic OAuth is banned by their TOS.', pillLabel: 'API key only', pillVariant: 'default' },
  { id: 'deepseek', name: 'DeepSeek', note: 'V4 thinking-mode supported via OpenAI-compatible chat completions.', pillLabel: 'Compatible', pillVariant: 'default' },
  { id: 'openrouter', name: 'OpenRouter', note: 'Provider-agnostic gateway. One key, many models.', pillLabel: 'Compatible', pillVariant: 'default' },
];

const DATA_PROVIDERS: ProviderRow[] = [
  { id: 'yfinance', name: 'Yahoo Finance', note: 'Free historical OHLCV via yfinance. Default — no configuration needed.', pillLabel: 'Default · Free', pillVariant: 'default' },
  { id: 'alpaca', name: 'Alpaca Markets', note: 'IEX/SIP feed for power users. Same key as the Alpaca broker tab.', pillLabel: 'Optional', pillVariant: 'optional' },
];

const BROKERS: ProviderRow[] = [
  { id: 'alpaca-paper', name: 'Alpaca Paper Trading', note: 'Default. Paper-only — no real-money risk.', pillLabel: 'Default', pillVariant: 'default' },
  { id: 'alpaca-live', name: 'Alpaca Live', note: 'Real-money trading. Disabled by default in this distribution. See CLAUDE.md §3 marketing posture.', pillLabel: 'Restricted', pillVariant: 'planned' },
];

function Settings() {
  const [active, setActive] = useState<Tab>('llm');
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>
          Configure providers and connections. All secrets will be stored in the OS
          keychain — never in plain text on disk.
        </p>
      </header>

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
            <ProviderList rows={LLM_PROVIDERS} actionLabel="Configure" />
          )}
          {active === 'data' && (
            <ProviderList rows={DATA_PROVIDERS} actionLabel="Configure" />
          )}
          {active === 'broker' && (
            <ProviderList rows={BROKERS} actionLabel="Configure" />
          )}
          {active === 'clawless' && <ClawlessTab />}
          {active === 'about' && <AboutTab />}

          <PhaseGuard />
        </section>
      </div>
    </div>
  );
}

interface ProviderListProps {
  rows: ProviderRow[];
  actionLabel: string;
}

function ProviderList({ rows, actionLabel }: ProviderListProps) {
  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <li key={row.id} className={styles.row}>
          <div className={styles.rowMain}>
            <div className={styles.rowName}>{row.name}</div>
            <div className={styles.rowNote}>{row.note}</div>
          </div>
          <div className={styles.rowAside}>
            <span className={`${styles.pill} ${styles[`pill_${row.pillVariant}`]}`}>
              {row.pillLabel}
            </span>
            <button className={styles.rowAction} type="button" disabled>
              {actionLabel}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ClawlessTab() {
  return (
    <div className={styles.formCard}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="clawless-url">Gateway URL</label>
        <input
          id="clawless-url"
          className={styles.input}
          placeholder="ws://127.0.0.1:18789"
          disabled
        />
        <span className={styles.helper}>
          Default port for the OpenClaw gateway. Leave blank to disable the connector.
        </span>
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="clawless-token">Gateway token</label>
        <input
          id="clawless-token"
          type="password"
          className={styles.input}
          placeholder="paste from Clawless settings"
          disabled
        />
        <span className={styles.helper}>
          The token grants broad read access to the gateway — store via OS keychain
          only. Never commit it.
        </span>
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className={styles.formCard}>
      <dl className={styles.aboutList}>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>Version</dt>
          <dd className={styles.aboutValue}>0.0.1</dd>
        </div>
        <div className={styles.aboutRow}>
          <dt className={styles.aboutKey}>Phase</dt>
          <dd className={styles.aboutValue}>Phase 3 — end-to-end debate streaming</dd>
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
      </dl>
    </div>
  );
}

function PhaseGuard() {
  return (
    <p className={styles.phaseGuard}>
      Configure actions are disabled in Phase 3 — secret storage and live wiring land
      in Phase 4 (LLM keys), Phase 5 (data + broker), and Phase 6 (Clawless connector).
    </p>
  );
}

export default Settings;
