import type { DebateEvent, AnalyzeDecision } from '../lib/engine-client';
import styles from './DebateStream.module.css';

interface DebateStreamProps {
  events: DebateEvent[];
  isStreaming: boolean;
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
  const groups = groupByPhase(events);
  const decision = findDecision(events);

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
          <div className={styles.decisionLabel}>Decision</div>
          <div className={styles.decisionAction}>{decision.action}</div>
          <div className={styles.decisionConfidence}>
            Confidence{' '}
            <span className={styles.decisionConfidenceValue}>
              {(decision.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className={styles.decisionReasoning}>{decision.reasoning}</div>
        </div>
      )}
    </section>
  );
}

export default DebateStream;
