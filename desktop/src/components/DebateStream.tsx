import type {
  DebateEvent,
  AnalyzeDecision,
  QuoteSummary,
  Headline,
  NewsHeadlinesEvent,
} from '../lib/engine-client';
import styles from './DebateStream.module.css';

interface DebateStreamProps {
  events: DebateEvent[];
  isStreaming: boolean;
}

function findSummary(events: DebateEvent[]): QuoteSummary | null {
  const ev = events.find((e) => e.type === 'data.summary');
  if (ev && ev.type === 'data.summary') {
    const { type: _t, ...summary } = ev;
    return summary as QuoteSummary;
  }
  return null;
}

function findHeadlines(events: DebateEvent[]): NewsHeadlinesEvent | null {
  const ev = events.find((e) => e.type === 'news.headlines');
  return ev && ev.type === 'news.headlines' ? ev : null;
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.round(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

interface PhaseGroup {
  phase: string;
  messages: Array<{ agent: string; content: string }>;
}

function groupByPhase(events: DebateEvent[]): PhaseGroup[] {
  const groups: PhaseGroup[] = [];
  for (const ev of events) {
    if (ev.type !== 'agent.message') continue;
    const last = groups[groups.length - 1];
    if (last && last.phase === ev.phase) {
      last.messages.push({ agent: ev.agent, content: ev.content });
    } else {
      groups.push({
        phase: ev.phase,
        messages: [{ agent: ev.agent, content: ev.content }],
      });
    }
  }
  return groups;
}

function findStart(events: DebateEvent[]): { ticker: string; trade_date: string } | null {
  const start = events.find((e) => e.type === 'session.start');
  if (start && start.type === 'session.start') {
    return { ticker: start.ticker, trade_date: start.trade_date };
  }
  return null;
}

function findDecision(events: DebateEvent[]): AnalyzeDecision | null {
  const complete = events.find((e) => e.type === 'session.complete');
  if (complete && complete.type === 'session.complete') {
    return complete.decision;
  }
  return null;
}

interface DecisionMeta {
  live: boolean;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

function findDecisionMeta(events: DebateEvent[]): DecisionMeta {
  const complete = events.find((e) => e.type === 'session.complete');
  if (complete && complete.type === 'session.complete') {
    return {
      live: complete.live === true,
      provider: complete.provider,
      model: complete.model,
      inputTokens: complete.input_tokens,
      outputTokens: complete.output_tokens,
      estimatedCostUsd: complete.estimated_cost_usd,
    };
  }
  return { live: false };
}

const PHASE_LABEL: Record<string, string> = {
  analysts: 'Analysts',
  researchers: 'Researchers',
  trader: 'Trader',
  risk: 'Risk',
};

const PHASE_DESCRIPTION: Record<string, string> = {
  analysts: 'Technical · Fundamental · News · Sentiment',
  researchers: 'Bull · Bear · Research Manager',
  trader: 'Trade plan',
  risk: 'Aggressive · Conservative · Neutral · Portfolio Manager',
};

function DebateStream({ events, isStreaming }: DebateStreamProps) {
  const start = findStart(events);
  const summary = findSummary(events);
  const news = findHeadlines(events);
  const groups = groupByPhase(events);
  const decision = findDecision(events);
  const meta = findDecisionMeta(events);

  if (events.length === 0) {
    return null;
  }

  return (
    <section className={styles.stream}>
      {start && (
        <header className={styles.header}>
          <div className={styles.headerLabel}>Session</div>
          <div className={styles.headerTitle}>
            <span className={styles.ticker}>{start.ticker}</span>
            <span className={styles.headerSep}>·</span>
            <span className={styles.tradeDate}>{start.trade_date}</span>
          </div>
          {isStreaming && (
            <div className={styles.streamingBadge}>
              <span className={styles.streamingDot} />
              Streaming
            </div>
          )}
        </header>
      )}

      {summary && (
        <div className={styles.summaryStrip}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Last close</span>
            <span className={styles.summaryValue}>{summary.last_close.toFixed(2)}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Period change</span>
            <span
              className={
                summary.period_change_pct >= 0
                  ? styles.summaryValuePositive
                  : styles.summaryValueNegative
              }
            >
              {summary.period_change_pct >= 0 ? '+' : ''}
              {summary.period_change_pct.toFixed(2)}%
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Range</span>
            <span className={styles.summaryValue}>
              {summary.period_low.toFixed(2)}–{summary.period_high.toFixed(2)}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Avg volume</span>
            <span className={styles.summaryValue}>{formatVolume(summary.avg_volume)}</span>
          </div>
          <div className={styles.summarySource}>
            {summary.sessions} sessions · {summary.source} · as of {summary.as_of}
          </div>
        </div>
      )}

      {news && news.headlines.length > 0 && (
        <div className={styles.news}>
          <div className={styles.newsHeader}>
            <span className={styles.newsLabel}>News</span>
            <span className={styles.newsSource}>
              {news.headlines.length} headline{news.headlines.length === 1 ? '' : 's'} · {news.source}
            </span>
          </div>
          <ul className={styles.newsList}>
            {news.headlines.map((h: Headline, idx: number) => (
              <li key={`${h.url || h.title}-${idx}`} className={styles.newsItem}>
                {h.url ? (
                  <a
                    className={styles.newsTitle}
                    href={h.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {h.title}
                  </a>
                ) : (
                  <span className={styles.newsTitle}>{h.title}</span>
                )}
                <span className={styles.newsMeta}>
                  {[h.publisher, h.pub_date && formatRelativeTime(h.pub_date)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.map((group, groupIdx) => (
        <div
          key={`${group.phase}-${groupIdx}`}
          className={`${styles.phase} ${styles[`phase_${group.phase}`] ?? ''}`}
        >
          <div className={styles.phaseHeader}>
            <span className={styles.phaseLabel}>
              {PHASE_LABEL[group.phase] ?? group.phase}
            </span>
            <span className={styles.phaseDescription}>
              {PHASE_DESCRIPTION[group.phase] ?? ''}
            </span>
          </div>
          <div className={styles.messages}>
            {group.messages.map((msg, idx) => (
              <article key={`${msg.agent}-${idx}`} className={styles.message}>
                <div className={styles.messageAgent}>{msg.agent}</div>
                <div className={styles.messageContent}>{msg.content}</div>
              </article>
            ))}
          </div>
        </div>
      ))}

      {decision && (
        <div className={`${styles.decision} ${styles[`decision_${decision.action}`] ?? ''}`}>
          <div className={styles.decisionLabel}>
            Decision
            {meta.live && (
              <span className={styles.decisionLiveBadge}>
                Live · {meta.provider ?? 'openai'} · {meta.model ?? '?'}
              </span>
            )}
          </div>
          <div className={styles.decisionAction}>{decision.action}</div>
          <div className={styles.decisionConfidence}>
            Confidence{' '}
            <span className={styles.decisionConfidenceValue}>
              {(decision.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className={styles.decisionReasoning}>{decision.reasoning}</div>
          {meta.live && (meta.estimatedCostUsd !== undefined || meta.inputTokens !== undefined) && (
            <div className={styles.decisionUsage}>
              {meta.inputTokens !== undefined && meta.outputTokens !== undefined && (
                <span>
                  {meta.inputTokens.toLocaleString()} in · {meta.outputTokens.toLocaleString()} out tokens
                </span>
              )}
              {meta.estimatedCostUsd !== undefined && (
                <span>
                  est cost ${meta.estimatedCostUsd.toFixed(4)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default DebateStream;
