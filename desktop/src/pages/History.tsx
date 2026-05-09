import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './History.module.css';
import DebateStream from '../components/DebateStream';
import {
  deleteSession,
  getSession,
  listSessions,
  type SessionDetail,
  type SessionSummary,
} from '../lib/engine-client';
import { buildTranscriptMarkdown } from '../lib/transcript';

type View = 'list' | 'detail';

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.round(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function actionPillClass(action: string): string {
  const key = action.toUpperCase();
  if (key === 'BUY') return styles.pill_buy;
  if (key === 'SELL') return styles.pill_sell;
  return styles.pill_hold;
}

function History() {
  const [view, setView] = useState<View>('list');
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Generation counter — guards against rapid row clicks where an earlier
  // (slower) fetch could land after a later one and stomp the UI.
  const detailGenRef = useRef(0);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const rows = await listSessions({ limit: 50 });
      setSessions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load sessions');
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onOpen = useCallback(async (id: string) => {
    const gen = ++detailGenRef.current;
    setActiveId(id);
    setView('detail');
    setDetail(null);
    setCopied(false);
    setError(null);
    try {
      const d = await getSession(id);
      // Only commit the result if no later click has superseded this one.
      if (gen === detailGenRef.current) {
        setDetail(d);
      }
    } catch (err) {
      if (gen === detailGenRef.current) {
        setError(err instanceof Error ? err.message : 'failed to load session');
      }
    }
  }, []);

  const onBack = useCallback(() => {
    setView('list');
    setActiveId(null);
    setDetail(null);
    setError(null);
  }, []);

  const onDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this saved session? This cannot be undone.')) return;
      setBusy(true);
      setError(null);
      try {
        await deleteSession(id);
        if (activeId === id) {
          onBack();
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'delete failed');
      } finally {
        setBusy(false);
      }
    },
    [activeId, onBack, refresh],
  );

  const onCopyTranscript = useCallback(async () => {
    if (!detail) return;
    const md = buildTranscriptMarkdown(detail.events);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError(`copy failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }, [detail]);

  const stats = useMemo(() => {
    if (!sessions) return null;
    const total = sessions.length;
    const live = sessions.filter((s) => s.live).length;
    const totalCost = sessions.reduce(
      (acc, s) => acc + (s.estimated_cost_usd ?? 0),
      0,
    );
    return { total, live, totalCost };
  }, [sessions]);

  if (view === 'detail') {
    return (
      <div className={styles.page}>
        <header className={styles.detailHeader}>
          <button className={styles.backButton} onClick={onBack} type="button">
            ← Back to history
          </button>
          {detail && (
            <div className={styles.detailToolbar}>
              <button
                className={styles.toolbarButton}
                onClick={onCopyTranscript}
                disabled={busy}
                type="button"
              >
                {copied ? 'Copied ✓' : 'Copy transcript'}
              </button>
              <button
                className={`${styles.toolbarButton} ${styles.toolbarDanger}`}
                onClick={() => void onDelete(detail.id)}
                disabled={busy}
                type="button"
              >
                Delete
              </button>
            </div>
          )}
        </header>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {!detail && !error && (
          <div className={styles.placeholder}>Loading session…</div>
        )}

        {detail && (
          <>
            <section className={styles.detailSummary}>
              <div className={styles.detailTickerBlock}>
                <span className={styles.detailTicker}>{detail.ticker}</span>
                <span className={styles.detailDate}>{detail.trade_date}</span>
              </div>
              <div className={styles.detailMetaBlock}>
                <span className={styles.detailMetaItem}>
                  Saved {formatRelative(detail.created_at)}
                </span>
                {detail.live ? (
                  <span className={styles.detailMetaPill}>
                    Live · {detail.model ?? 'openai'}
                  </span>
                ) : (
                  <span className={styles.detailMetaPillNeutral}>Stub debate</span>
                )}
                {detail.estimated_cost_usd !== null && (
                  <span className={styles.detailMetaItem}>
                    est ${detail.estimated_cost_usd.toFixed(4)}
                  </span>
                )}
              </div>
            </section>

            <DebateStream events={detail.events} isStreaming={false} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>History</h1>
        <p className={styles.pageSubtitle}>
          Past debates the engine has saved. Each row is a completed session —
          aborted runs are not stored. Sessions live in <code className={styles.code}>data/sessions.db</code>{' '}
          next to the engine.
        </p>
      </header>

      {stats && stats.total > 0 && (
        <div className={styles.statBar}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Sessions</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Live</span>
            <span className={styles.statValue}>{stats.live}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Stub</span>
            <span className={styles.statValue}>{stats.total - stats.live}</span>
          </div>
          {stats.totalCost > 0 && (
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Est. cost (live)</span>
              <span className={styles.statValue}>
                ${stats.totalCost.toFixed(4)}
              </span>
            </div>
          )}
        </div>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}

      {sessions === null && !error && (
        <div className={styles.placeholder}>Loading…</div>
      )}

      {sessions && sessions.length === 0 && !error && (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>No saved sessions yet</h2>
          <p className={styles.emptyBody}>
            Run an analysis on the <a href="#analyze">Analyze</a> page and the
            engine will write a row here when the debate completes. Sessions
            stay local — nothing leaves your machine.
          </p>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <ul className={styles.list}>
          {sessions.map((s) => (
            <li key={s.id} className={styles.row}>
              <button
                className={styles.rowMain}
                onClick={() => void onOpen(s.id)}
                type="button"
              >
                <div className={styles.rowHeadline}>
                  <span className={styles.rowTicker}>{s.ticker}</span>
                  <span className={`${styles.actionPill} ${actionPillClass(s.decision_action)}`}>
                    {s.decision_action}
                    <span className={styles.actionConfidence}>
                      {Math.round(s.decision_confidence * 100)}%
                    </span>
                  </span>
                  {s.live && <span className={styles.livePill}>Live · {s.model ?? 'openai'}</span>}
                </div>
                <div className={styles.rowMeta}>
                  <span>{s.trade_date}</span>
                  <span className={styles.rowSep}>·</span>
                  <span>{formatRelative(s.created_at)}</span>
                  {s.estimated_cost_usd !== null && (
                    <>
                      <span className={styles.rowSep}>·</span>
                      <span>est ${s.estimated_cost_usd.toFixed(4)}</span>
                    </>
                  )}
                </div>
                <div className={styles.rowReasoning}>{s.decision_reasoning}</div>
              </button>
              <button
                className={styles.rowDelete}
                onClick={() => void onDelete(s.id)}
                disabled={busy}
                type="button"
                aria-label={`Delete session ${s.ticker} ${s.trade_date}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default History;
