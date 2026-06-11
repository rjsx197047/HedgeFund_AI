"""Outcome scoring — compare past analysis decisions with subsequent prices.

This is the engine half of the Scorecard feature: every completed *live*
session in `sessions` gets scored, per horizon, against what the market
actually did after its trade date. The point is educational honesty — the
lab shows users where the multi-agent debate aligned with subsequent price
action and where it didn't, including confidence calibration (when the
committee said 80%, how often was it aligned?).

## Scoring model

For each (session, horizon) pair we look up the daily close on the trade
date (entry) and the close `horizon` trading days later (exit), then grade
the decision against the realized return:

- BUY  → aligned when return > +band
- SELL → aligned when return < -band
- HOLD → aligned when |return| <= band

The band is a per-horizon dead zone (±1.5% at 5 days, ±3% at 20 days) so
noise-level drift doesn't flip a verdict. A session whose horizon has not
matured yet (not enough bars after the trade date) is simply skipped and
re-attempted on the next refresh — `pending` in the scorecard payload.

Stub sessions (live=0) are never scored: their decision is canned, so
grading it would teach nothing and pollute the aggregates.

## Tables

One new table joins the existing schema (additive, IF NOT EXISTS — older
engines ignore it):

- `outcomes` — one row per (session_id, horizon_days), written once when
  the horizon matures. Sessions deleted from History drop out of the
  scorecard via the INNER JOIN; refresh also sweeps orphaned rows.

## Price source

yfinance daily closes, one fetch per ticker per refresh (grouped). The
fetch function is module-level so tests can monkeypatch it with synthetic
series. Refresh is best-effort per ticker: an unreachable ticker is
reported in `errors` and the rest still evaluate.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterator, Optional

from .ticker import normalize_ticker


# Trading-day horizons we score, with their alignment dead zones. Ordered
# short → long; the scorecard renders them in this order.
HORIZONS: tuple[tuple[int, float], ...] = (
    (5, 1.5),
    (20, 3.0),
)

# How many recent outcome rows the scorecard payload carries.
_RECENT_LIMIT = 50

# Calibration buckets over decision_confidence. Half-open [lo, hi) except
# the last, which is inclusive of 1.0.
_CALIBRATION_BUCKETS: tuple[tuple[str, float, float], ...] = (
    ("under 55%", 0.0, 0.55),
    ("55 to 70%", 0.55, 0.70),
    ("70 to 85%", 0.70, 0.85),
    ("85% and up", 0.85, 1.01),
)


_SCHEMA_DDL = """
CREATE TABLE IF NOT EXISTS outcomes (
    session_id TEXT NOT NULL,
    horizon_days INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    entry_close REAL NOT NULL,
    exit_date TEXT NOT NULL,
    exit_close REAL NOT NULL,
    return_pct REAL NOT NULL,
    verdict TEXT NOT NULL,
    evaluated_at TEXT NOT NULL,
    PRIMARY KEY (session_id, horizon_days)
);
"""


# ---- DB plumbing (same pattern as cost_guard.py — own path resolution) ----


def _default_db_path() -> Path:
    override = os.environ.get("TAL_SESSIONS_DB")
    if override:
        return Path(override).expanduser().resolve()
    return (Path.cwd() / "data" / "sessions.db").resolve()


_db_path: Path = _default_db_path()
_initialized = False


def _reset_for_tests() -> None:
    global _db_path, _initialized
    _db_path = _default_db_path()
    _initialized = False


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(str(_db_path))
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=5000")
        yield conn
    finally:
        conn.close()


def _ensure_initialized() -> None:
    """Create the outcomes table; also make sure sessions exists first."""
    global _initialized
    if _initialized:
        return
    # The sessions table must exist for the joins below. storage owns it.
    from . import storage

    storage._ensure_initialized()
    with _connect() as conn:
        conn.executescript(_SCHEMA_DDL)
        conn.commit()
    _initialized = True


def _utc_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time()))


# ---- Price fetch (module-level so tests can monkeypatch) -------------------


def _fetch_closes(ticker: str, start_iso: str, end_iso: str) -> list[tuple[str, float]]:
    """Daily closes for `ticker` between dates, sorted ascending.

    Returns [(YYYY-MM-DD, close), ...]. Raises on fetch failure — the
    caller treats a raise as "this ticker errored, skip its sessions".
    """
    import yfinance as yf

    spec = normalize_ticker(ticker)
    yt = yf.Ticker(spec.yfinance_symbol)
    hist = yt.history(start=start_iso, end=end_iso)
    if hist is None or hist.empty:
        return []
    if hist.index.tz is not None:
        hist.index = hist.index.tz_localize(None)
    out: list[tuple[str, float]] = []
    for idx, row in hist.iterrows():
        close = float(row["Close"])
        if close > 0:
            out.append((idx.date().isoformat(), close))
    out.sort(key=lambda pair: pair[0])
    return out


# ---- Verdict logic ---------------------------------------------------------


def grade(action: str, return_pct: float, band_pct: float) -> str:
    """Grade one decision against the realized return. Pure function."""
    key = (action or "").upper()
    if key == "BUY":
        return "aligned" if return_pct > band_pct else "contrary"
    if key == "SELL":
        return "aligned" if return_pct < -band_pct else "contrary"
    # HOLD (and anything unrecognized — parser defaults to HOLD upstream).
    return "aligned" if abs(return_pct) <= band_pct else "contrary"


# ---- Refresh ---------------------------------------------------------------


@dataclass
class RefreshResult:
    evaluated: int      # outcome rows written this pass
    pending: int        # (session, horizon) pairs still waiting on data
    errors: list[str]   # tickers whose price fetch failed


def refresh_outcomes(*, limit: int = 200) -> RefreshResult:
    """Score every live session/horizon pair that lacks an outcome row.

    Groups work by ticker so each ticker costs one price fetch regardless
    of how many sessions reference it. `limit` bounds the number of pairs
    examined per call to keep request latency sane on huge histories.
    """
    _ensure_initialized()

    with _connect() as conn:
        # Sweep outcome rows whose session was deleted from History.
        conn.execute(
            "DELETE FROM outcomes WHERE session_id NOT IN (SELECT id FROM sessions)"
        )
        conn.commit()

        rows = conn.execute(
            """
            SELECT s.id, s.ticker, s.trade_date, s.decision_action,
                   s.decision_confidence
            FROM sessions s
            WHERE s.live = 1
            ORDER BY s.trade_date ASC
            """
        ).fetchall()
        done = {
            (r["session_id"], int(r["horizon_days"]))
            for r in conn.execute(
                "SELECT session_id, horizon_days FROM outcomes"
            ).fetchall()
        }

    # Build the work list: one item per (session, horizon) missing a row.
    work: list[tuple[sqlite3.Row, int, float]] = []
    for row in rows:
        for horizon, band in HORIZONS:
            if (row["id"], horizon) not in done:
                work.append((row, horizon, band))
    work = work[: max(1, limit)]
    if not work:
        return RefreshResult(evaluated=0, pending=0, errors=[])

    # One price series per ticker, spanning the earliest trade date it
    # needs through tomorrow (yfinance end is exclusive).
    by_ticker: dict[str, list[tuple[sqlite3.Row, int, float]]] = {}
    for item in work:
        by_ticker.setdefault(item[0]["ticker"], []).append(item)

    evaluated = 0
    pending = 0
    errors: list[str] = []
    writes: list[tuple[Any, ...]] = []
    now_iso = _utc_iso()

    for ticker, items in by_ticker.items():
        earliest = min(i[0]["trade_date"] for i in items)
        # 7 calendar days of cushion before the trade date so weekends and
        # holidays still leave an entry bar at or before it.
        start = (
            datetime.strptime(earliest, "%Y-%m-%d") - timedelta(days=7)
        ).date().isoformat()
        end = (datetime.now() + timedelta(days=1)).date().isoformat()
        try:
            closes = _fetch_closes(ticker, start, end)
        except Exception as exc:  # noqa: BLE001 — best-effort per ticker
            sys.stderr.write(
                f"[outcomes] fetch FAILED {ticker} ({type(exc).__name__}: {exc})\n"
            )
            errors.append(ticker)
            continue
        if not closes:
            errors.append(ticker)
            continue
        dates = [d for d, _ in closes]

        for row, horizon, band in items:
            trade_date = row["trade_date"]
            # Entry = the latest bar at or before the trade date — the
            # close the analysts actually saw when the decision was made.
            entry_idx = None
            for i in range(len(dates) - 1, -1, -1):
                if dates[i] <= trade_date:
                    entry_idx = i
                    break
            if entry_idx is None:
                pending += 1
                continue
            exit_idx = entry_idx + horizon
            if exit_idx >= len(dates):
                pending += 1  # horizon not matured yet — retry next refresh
                continue
            entry_date, entry_close = closes[entry_idx]
            exit_date, exit_close = closes[exit_idx]
            return_pct = round((exit_close - entry_close) / entry_close * 100, 2)
            verdict = grade(row["decision_action"], return_pct, band)
            writes.append(
                (
                    row["id"], horizon, entry_date, round(entry_close, 4),
                    exit_date, round(exit_close, 4), return_pct, verdict,
                    now_iso,
                )
            )
            evaluated += 1

    if writes:
        with _connect() as conn:
            conn.executemany(
                """
                INSERT OR REPLACE INTO outcomes (
                    session_id, horizon_days, entry_date, entry_close,
                    exit_date, exit_close, return_pct, verdict, evaluated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                writes,
            )
            conn.commit()

    return RefreshResult(evaluated=evaluated, pending=pending, errors=errors)


# ---- Scorecard aggregation -------------------------------------------------


def get_scorecard() -> dict[str, Any]:
    """Aggregate outcomes into the scorecard payload the renderer shows.

    All aggregation happens in Python over a single joined read — the
    volumes here are hundreds of rows, not millions; clarity wins.
    """
    _ensure_initialized()
    with _connect() as conn:
        joined = conn.execute(
            """
            SELECT o.session_id, o.horizon_days, o.entry_date, o.entry_close,
                   o.exit_date, o.exit_close, o.return_pct, o.verdict,
                   o.evaluated_at,
                   s.ticker, s.trade_date, s.decision_action,
                   s.decision_confidence, s.provider, s.model
            FROM outcomes o
            INNER JOIN sessions s ON s.id = o.session_id
            ORDER BY s.trade_date DESC, o.horizon_days ASC
            """
        ).fetchall()
        live_sessions = conn.execute(
            "SELECT COUNT(*) AS n FROM sessions WHERE live = 1"
        ).fetchone()["n"]

    horizons: list[dict[str, Any]] = []
    for horizon, band in HORIZONS:
        rows = [r for r in joined if int(r["horizon_days"]) == horizon]
        aligned = sum(1 for r in rows if r["verdict"] == "aligned")

        by_action: dict[str, dict[str, int]] = {}
        for r in rows:
            bucket = by_action.setdefault(
                str(r["decision_action"]).upper(), {"evaluated": 0, "aligned": 0}
            )
            bucket["evaluated"] += 1
            if r["verdict"] == "aligned":
                bucket["aligned"] += 1

        calibration = []
        for label, lo, hi in _CALIBRATION_BUCKETS:
            in_bucket = [
                r for r in rows if lo <= float(r["decision_confidence"]) < hi
            ]
            calibration.append(
                {
                    "label": label,
                    "evaluated": len(in_bucket),
                    "aligned": sum(
                        1 for r in in_bucket if r["verdict"] == "aligned"
                    ),
                }
            )

        horizons.append(
            {
                "horizon_days": horizon,
                "band_pct": band,
                "evaluated": len(rows),
                "aligned": aligned,
                "by_action": by_action,
                "calibration": calibration,
            }
        )

    # Pending = live (session, horizon) pairs without an outcome row yet.
    scored_pairs = len(joined)
    pending = max(0, live_sessions * len(HORIZONS) - scored_pairs)

    recent = [
        {
            "session_id": r["session_id"],
            "ticker": r["ticker"],
            "trade_date": r["trade_date"],
            "action": str(r["decision_action"]).upper(),
            "confidence": float(r["decision_confidence"]),
            "horizon_days": int(r["horizon_days"]),
            "entry_date": r["entry_date"],
            "entry_close": float(r["entry_close"]),
            "exit_date": r["exit_date"],
            "exit_close": float(r["exit_close"]),
            "return_pct": float(r["return_pct"]),
            "verdict": r["verdict"],
            "provider": r["provider"],
            "model": r["model"],
        }
        for r in joined[:_RECENT_LIMIT]
    ]

    return {
        "generated_at": _utc_iso(),
        "live_sessions": int(live_sessions),
        "pending": int(pending),
        "horizons": horizons,
        "recent": recent,
    }


def refresh_result_to_dict(result: RefreshResult) -> dict[str, Any]:
    return {
        "evaluated": result.evaluated,
        "pending": result.pending,
        "errors": result.errors,
    }


# Optional — kept for symmetry with cost_guard.initialize(); server code can
# call this at startup if eager table creation is ever wanted.
def initialize() -> None:
    _ensure_initialized()
