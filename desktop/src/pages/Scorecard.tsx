import { useCallback, useEffect, useState } from 'react';
import styles from './Scorecard.module.css';
import {
  getScorecard,
  refreshOutcomes,
  type Scorecard as ScorecardPayload,
  type ScorecardHorizon,
} from '../lib/engine-client';

/**
 * Scorecard — honest review of how past live analyses compared with what
 * the market subsequently did.
 *
 * Educational posture (CLAUDE.md §3): this page deliberately reports both
 * aligned AND contrary outcomes with equal visual weight, plus confidence
 * calibration. It is a learning instrument, not a performance pitch — no
 * win-rate framing, no extrapolation, and the copy never implies the
 * agents predict anything.
 */

const ACTION_ORDER = ['BUY', 'SELL', 'HOLD'];

function pct(part: number, whole: number): string {
  if (whole <= 0) return '–';
  return `${Math.round((part / whole) * 100)}%`;
}

function actionPillClass(action: string): string {
  const key = action.toUpperCase();
  if (key === 'BUY') return styles.pill_buy;
  if (key === 'SELL') return styles.pill_sell;
  return styles.pill_hold;
}

function Scorecard() {
  const [card, setCard] = useState<ScorecardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCard(await getScorecard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load scorecard');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await refreshOutcomes();
      const parts: string[] = [];
      parts.push(
        result.evaluated === 1
          ? '1 outcome scored'
          : `${result.evaluated} outcomes scored`,
      );
      if (result.pending > 0) {
        parts.push(`${result.pending} still maturing`);
      }
      if (result.errors.length > 0) {
        parts.push(`no price data for ${result.errors.join(', ')}`);
      }
      setNotice(parts.join(' · '));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const totalEvaluated =
    card?.horizons.reduce((acc, h) => acc + h.evaluated, 0) ?? 0;

  return (
    <div className={styles.page} data-testid="scorecard-page">
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Scorecard</h1>
        <p className={styles.pageSubtitle}>
          How past live analyses compared with what actually happened in the
          market afterward. Each completed debate is scored at two horizons
          against subsequent daily closes. This is an educational review of
          past output, not a measure of future results.
        </p>
      </header>

      <div className={styles.toolbar}>
        <button
          className={styles.refreshButton}
          onClick={() => void onRefresh()}
          disabled={refreshing}
          type="button"
        >
          {refreshing ? 'Scoring…' : 'Score new outcomes'}
        </button>
        {card && (
          <span className={styles.toolbarMeta}>
            {card.live_sessions} live session{card.live_sessions === 1 ? '' : 's'}
            {card.pending > 0 && ` · ${card.pending} outcome${card.pending === 1 ? '' : 's'} still maturing`}
          </span>
        )}
      </div>

      {notice && <div className={styles.noticeBanner}>{notice}</div>}
      {error && <div className={styles.errorBanner}>{error}</div>}

      {card === null && !error && (
        <div className={styles.placeholder}>Loading…</div>
      )}

      {card && totalEvaluated === 0 && (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Nothing scored yet</h2>
          <p className={styles.emptyBody}>
            Run live analyses on the <a href="#analyze">Analyze</a> page, wait
            for the market to trade past their dates, then click{' '}
            <strong>Score new outcomes</strong>. Stub debates are never scored
            because their decision is canned. Outcomes need at least 5 trading
            days after the trade date to mature.
          </p>
        </div>
      )}

      {card &&
        card.horizons
          .filter((h) => h.evaluated > 0)
          .map((h) => <HorizonSection key={h.horizon_days} horizon={h} />)}

      {card && card.recent.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent outcomes</h2>
          <ul className={styles.list}>
            {card.recent.map((row) => (
              <li
                key={`${row.session_id}-${row.horizon_days}`}
                className={styles.row}
              >
                <div className={styles.rowHeadline}>
                  <span className={styles.rowTicker}>{row.ticker}</span>
                  <span className={`${styles.actionPill} ${actionPillClass(row.action)}`}>
                    {row.action}
                    <span className={styles.actionConfidence}>
                      {Math.round(row.confidence * 100)}%
                    </span>
                  </span>
                  <span
                    className={
                      row.verdict === 'aligned'
                        ? styles.verdictAligned
                        : styles.verdictContrary
                    }
                  >
                    {row.verdict}
                  </span>
                  <span className={styles.horizonTag}>{row.horizon_days}d</span>
                </div>
                <div className={styles.rowMeta}>
                  <span>{row.trade_date}</span>
                  <span className={styles.rowSep}>·</span>
                  <span>
                    ${row.entry_close.toFixed(2)} → ${row.exit_close.toFixed(2)}
                  </span>
                  <span className={styles.rowSep}>·</span>
                  <span
                    className={
                      row.return_pct >= 0 ? styles.retPositive : styles.retNegative
                    }
                  >
                    {row.return_pct >= 0 ? '+' : ''}
                    {row.return_pct.toFixed(2)}%
                  </span>
                  {row.provider && (
                    <>
                      <span className={styles.rowSep}>·</span>
                      <span>
                        {row.provider} · {row.model ?? '?'}
                      </span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.disclaimer}>
        Aligned means the decision pointed the same way the price later moved
        beyond a small noise band; contrary means it did not. Past alignment
        carries no information about future market behavior. Educational
        research only. Not investment advice.
      </p>
    </div>
  );
}

function HorizonSection({ horizon }: { horizon: ScorecardHorizon }) {
  const actions = ACTION_ORDER.filter((a) => horizon.by_action[a]).concat(
    Object.keys(horizon.by_action).filter((a) => !ACTION_ORDER.includes(a)),
  );
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {horizon.horizon_days} trading days
        <span className={styles.sectionHint}>
          noise band ±{horizon.band_pct}%
        </span>
      </h2>

      <div className={styles.statBar}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Scored</span>
          <span className={styles.statValue}>{horizon.evaluated}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Aligned</span>
          <span className={styles.statValue}>
            {horizon.aligned} ({pct(horizon.aligned, horizon.evaluated)})
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Contrary</span>
          <span className={styles.statValue}>
            {horizon.evaluated - horizon.aligned} (
            {pct(horizon.evaluated - horizon.aligned, horizon.evaluated)})
          </span>
        </div>
      </div>

      <div className={styles.tables}>
        <table className={styles.table}>
          <caption className={styles.tableCaption}>By decision</caption>
          <thead>
            <tr>
              <th>Action</th>
              <th>Scored</th>
              <th>Aligned</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => {
              const cell = horizon.by_action[a];
              return (
                <tr key={a}>
                  <td>{a}</td>
                  <td>{cell.evaluated}</td>
                  <td>
                    {cell.aligned} ({pct(cell.aligned, cell.evaluated)})
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <table className={styles.table}>
          <caption className={styles.tableCaption}>
            Confidence calibration
          </caption>
          <thead>
            <tr>
              <th>Stated confidence</th>
              <th>Scored</th>
              <th>Aligned</th>
            </tr>
          </thead>
          <tbody>
            {horizon.calibration.map((bucket) => (
              <tr key={bucket.label}>
                <td>{bucket.label}</td>
                <td>{bucket.evaluated}</td>
                <td>
                  {bucket.evaluated > 0
                    ? `${bucket.aligned} (${pct(bucket.aligned, bucket.evaluated)})`
                    : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default Scorecard;
