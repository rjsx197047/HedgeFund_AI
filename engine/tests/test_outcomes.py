"""Tests for engine/outcomes.py — outcome scoring + scorecard aggregation.

The price fetch is monkeypatched with synthetic daily-close series so the
suite is deterministic and offline. Sessions are written through the real
storage API so the join paths (including the live=1 filter and the
orphan sweep) are exercised against an actual SQLite file.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from engine import outcomes, storage


# ---- Helpers ---------------------------------------------------------------


def _weekday_series(
    start: str, n: int, *, base: float = 100.0, step: float = 0.0
) -> list[tuple[str, float]]:
    """N weekday closes starting at `start`, drifting by `step` per bar."""
    d = date.fromisoformat(start)
    out: list[tuple[str, float]] = []
    price = base
    while len(out) < n:
        if d.weekday() < 5:
            out.append((d.isoformat(), round(price, 4)))
            price += step
        d += timedelta(days=1)
    return out


def _write_live_session(
    *,
    ticker: str = "NVDA",
    trade_date: str = "2026-04-01",
    action: str = "BUY",
    confidence: float = 0.8,
) -> str:
    sid = storage.write_session(
        ticker=ticker,
        trade_date=trade_date,
        events=[{"type": "session.complete", "decision": {"action": action}}],
        decision={"action": action, "confidence": confidence, "reasoning": "t"},
        live=True,
        provider="openai",
        model="gpt-5",
        estimated_cost_usd=0.01,
    )
    assert sid is not None
    return sid


def _patch_prices(monkeypatch, series_by_ticker: dict[str, list[tuple[str, float]]]):
    calls: list[str] = []

    def fake_fetch(ticker: str, start: str, end: str) -> list[tuple[str, float]]:
        calls.append(ticker)
        if ticker not in series_by_ticker:
            raise RuntimeError("no data feed for " + ticker)
        return [p for p in series_by_ticker[ticker] if start <= p[0] < end]

    monkeypatch.setattr(outcomes, "_fetch_closes", fake_fetch)
    return calls


# ---- grade() — pure verdict logic ------------------------------------------


@pytest.mark.parametrize(
    ("action", "ret", "band", "expected"),
    [
        ("BUY", 5.0, 1.5, "aligned"),
        ("BUY", 1.5, 1.5, "contrary"),   # band edge is not enough for BUY
        ("BUY", -2.0, 1.5, "contrary"),
        ("SELL", -5.0, 1.5, "aligned"),
        ("SELL", 0.5, 1.5, "contrary"),
        ("HOLD", 1.0, 1.5, "aligned"),
        ("HOLD", -1.5, 1.5, "aligned"),  # band edge inclusive for HOLD
        ("HOLD", 4.0, 1.5, "contrary"),
        ("hold", 0.0, 1.5, "aligned"),   # case-insensitive
        ("???", 0.0, 1.5, "aligned"),    # unknown action treated as HOLD
    ],
)
def test_grade(action: str, ret: float, band: float, expected: str) -> None:
    assert outcomes.grade(action, ret, band) == expected


# ---- refresh_outcomes -------------------------------------------------------


def test_refresh_scores_matured_horizons(tmp_db, monkeypatch) -> None:
    # 40 weekday bars rising 1/bar from 100 — BUY on bar 0 is aligned at
    # both horizons (+5% at 5d, +20% at 20d).
    series = _weekday_series("2026-04-01", 40, base=100.0, step=1.0)
    _patch_prices(monkeypatch, {"NVDA": series})
    sid = _write_live_session(ticker="NVDA", trade_date="2026-04-01", action="BUY")

    result = outcomes.refresh_outcomes()
    assert result.evaluated == 2  # both horizons matured
    assert result.pending == 0
    assert result.errors == []

    card = outcomes.get_scorecard()
    assert card["live_sessions"] == 1
    assert card["pending"] == 0
    by_h = {h["horizon_days"]: h for h in card["horizons"]}
    assert by_h[5]["evaluated"] == 1 and by_h[5]["aligned"] == 1
    assert by_h[20]["evaluated"] == 1 and by_h[20]["aligned"] == 1
    row5 = next(r for r in card["recent"] if r["horizon_days"] == 5)
    assert row5["session_id"] == sid
    assert row5["entry_close"] == 100.0
    assert row5["exit_close"] == 105.0
    assert row5["return_pct"] == 5.0
    assert row5["verdict"] == "aligned"


def test_refresh_leaves_unmatured_horizon_pending(tmp_db, monkeypatch) -> None:
    # Only 10 bars after entry — 5d matures, 20d stays pending.
    series = _weekday_series("2026-04-01", 11, base=100.0, step=-1.0)
    _patch_prices(monkeypatch, {"NVDA": series})
    _write_live_session(ticker="NVDA", trade_date="2026-04-01", action="SELL")

    result = outcomes.refresh_outcomes()
    assert result.evaluated == 1
    assert result.pending == 1

    card = outcomes.get_scorecard()
    assert card["pending"] == 1
    by_h = {h["horizon_days"]: h for h in card["horizons"]}
    # Falling series — SELL aligned at 5d.
    assert by_h[5]["aligned"] == 1
    assert by_h[20]["evaluated"] == 0


def test_refresh_is_idempotent(tmp_db, monkeypatch) -> None:
    series = _weekday_series("2026-04-01", 40)
    calls = _patch_prices(monkeypatch, {"NVDA": series})
    _write_live_session(ticker="NVDA", trade_date="2026-04-01", action="HOLD")

    first = outcomes.refresh_outcomes()
    assert first.evaluated == 2
    second = outcomes.refresh_outcomes()
    assert second.evaluated == 0
    assert second.pending == 0
    # Second pass had no work for the ticker — no extra fetch.
    assert calls.count("NVDA") == 1


def test_refresh_skips_stub_sessions(tmp_db, monkeypatch) -> None:
    series = _weekday_series("2026-04-01", 40)
    _patch_prices(monkeypatch, {"NVDA": series})
    storage.write_session(
        ticker="NVDA",
        trade_date="2026-04-01",
        events=[],
        decision={"action": "BUY", "confidence": 0.9, "reasoning": "canned"},
        live=False,
    )
    result = outcomes.refresh_outcomes()
    assert result.evaluated == 0
    card = outcomes.get_scorecard()
    assert card["live_sessions"] == 0
    assert card["pending"] == 0


def test_refresh_fetch_failure_is_isolated(tmp_db, monkeypatch) -> None:
    # AAPL has no feed in the fake — its sessions error; NVDA still scores.
    series = _weekday_series("2026-04-01", 40, step=1.0)
    _patch_prices(monkeypatch, {"NVDA": series})
    _write_live_session(ticker="NVDA", trade_date="2026-04-01", action="BUY")
    _write_live_session(ticker="AAPL", trade_date="2026-04-01", action="BUY")

    result = outcomes.refresh_outcomes()
    assert result.evaluated == 2
    assert result.errors == ["AAPL"]


def test_entry_uses_latest_bar_at_or_before_trade_date(tmp_db, monkeypatch) -> None:
    # 2026-04-04 is a Saturday — entry should fall back to Friday 04-03.
    series = _weekday_series("2026-04-01", 40, base=100.0, step=1.0)
    _patch_prices(monkeypatch, {"NVDA": series})
    _write_live_session(ticker="NVDA", trade_date="2026-04-04", action="BUY")

    outcomes.refresh_outcomes()
    card = outcomes.get_scorecard()
    row = card["recent"][0]
    assert row["entry_date"] == "2026-04-03"


def test_orphaned_outcomes_swept_after_session_delete(tmp_db, monkeypatch) -> None:
    series = _weekday_series("2026-04-01", 40)
    _patch_prices(monkeypatch, {"NVDA": series})
    sid = _write_live_session(ticker="NVDA", trade_date="2026-04-01")
    outcomes.refresh_outcomes()
    assert outcomes.get_scorecard()["horizons"][0]["evaluated"] == 1

    assert storage.delete_session(sid)
    # Scorecard joins on sessions — deleted session drops out immediately.
    assert outcomes.get_scorecard()["horizons"][0]["evaluated"] == 0
    # And refresh physically sweeps the orphan rows.
    outcomes.refresh_outcomes()
    with outcomes._connect() as conn:
        n = conn.execute("SELECT COUNT(*) AS n FROM outcomes").fetchone()["n"]
    assert n == 0


def test_calibration_buckets(tmp_db, monkeypatch) -> None:
    series = _weekday_series("2026-04-01", 40, base=100.0, step=1.0)
    _patch_prices(monkeypatch, {"NVDA": series})
    _write_live_session(trade_date="2026-04-01", action="BUY", confidence=0.9)
    _write_live_session(trade_date="2026-04-01", action="SELL", confidence=0.6)

    outcomes.refresh_outcomes()
    card = outcomes.get_scorecard()
    by_h = {h["horizon_days"]: h for h in card["horizons"]}
    cal = {c["label"]: c for c in by_h[5]["calibration"]}
    # Rising series: BUY (conf .9) aligned, SELL (conf .6) contrary.
    assert cal["85% and up"]["evaluated"] == 1
    assert cal["85% and up"]["aligned"] == 1
    assert cal["55 to 70%"]["evaluated"] == 1
    assert cal["55 to 70%"]["aligned"] == 0
    by_action = by_h[5]["by_action"]
    assert by_action["BUY"] == {"evaluated": 1, "aligned": 1}
    assert by_action["SELL"] == {"evaluated": 1, "aligned": 0}
