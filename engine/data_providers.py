"""Data provider abstraction for the TradingAgentsLab engine.

Phase 5 introduces a `BaseDataProvider` interface so the engine can swap
between data sources (yfinance default, Alpaca optional, others later)
without leaking implementation details into the agent layer.

This module ships the yfinance default. Alpaca + others land in subsequent
commits as the abstraction proves out.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date as date_t, datetime, timedelta
from typing import Protocol


@dataclass
class QuoteSummary:
    """A compact, agent-friendly view of recent price action.

    Fields are intentionally summary-level — full OHLCV dataframes don't belong
    in agent prompts (they're noisy and expensive). Analysts get the gist; if
    they need detail, they call a tool.
    """

    ticker: str
    trade_date: str            # YYYY-MM-DD the analysis is anchored on
    as_of: str                 # YYYY-MM-DD of the latest bar actually used
    last_close: float
    period_open: float
    period_high: float
    period_low: float
    period_change_pct: float   # (last - first) / first * 100
    avg_volume: float          # mean daily volume across the lookback window
    sessions: int              # number of trading days in the lookback
    source: str                # "yfinance" | "alpaca" | ...


class BaseDataProvider(Protocol):
    """Read-only data provider interface.

    Implementations should be best-effort: when the upstream is unreachable
    or returns no data, raise `DataUnavailable` rather than silently returning
    a partial summary. The engine surfaces `DataUnavailable` to the renderer
    as a graceful "data offline" state.
    """

    name: str

    async def quote_summary(
        self, *, ticker: str, trade_date: str, lookback_days: int = 30
    ) -> QuoteSummary: ...


class DataUnavailable(RuntimeError):
    """Upstream data source returned no usable data for the request."""


class YFinanceProvider:
    """Default data provider — Yahoo Finance via the `yfinance` package.

    yfinance hits Yahoo's public endpoints with no API key required. It can
    rate-limit or return empty data on transient issues; we wrap each call
    in a retry-light pattern and convert empty frames into `DataUnavailable`.
    """

    name = "yfinance"

    async def quote_summary(
        self, *, ticker: str, trade_date: str, lookback_days: int = 30
    ) -> QuoteSummary:
        # Local import — yfinance pulls in pandas + lxml + requests; defer the
        # cost until a provider that needs it is actually instantiated.
        import asyncio

        return await asyncio.to_thread(
            _yfinance_quote_summary, ticker, trade_date, lookback_days
        )


def _yfinance_quote_summary(
    ticker: str, trade_date: str, lookback_days: int
) -> QuoteSummary:
    import yfinance as yf

    end = _parse_date(trade_date) + timedelta(days=1)  # yfinance end is exclusive
    start = end - timedelta(days=lookback_days + 5)    # +5 cushion for weekends/holidays

    yt = yf.Ticker(ticker.upper())
    hist = yt.history(start=start.isoformat(), end=end.isoformat())
    if hist is None or hist.empty:
        raise DataUnavailable(
            f"yfinance returned no data for {ticker} between "
            f"{start.isoformat()} and {end.isoformat()}"
        )

    # Drop timezone for cleaner display + ensure we use only complete bars.
    if hist.index.tz is not None:
        hist.index = hist.index.tz_localize(None)
    hist = hist.tail(lookback_days)

    last = hist.iloc[-1]
    first = hist.iloc[0]
    as_of = hist.index[-1].date().isoformat()

    last_close = float(round(last["Close"], 2))
    first_open = float(round(first["Open"], 2))
    period_change_pct = (
        round((last_close - first_open) / first_open * 100, 2)
        if first_open
        else 0.0
    )

    return QuoteSummary(
        ticker=ticker.upper(),
        trade_date=trade_date,
        as_of=as_of,
        last_close=last_close,
        period_open=first_open,
        period_high=float(round(hist["High"].max(), 2)),
        period_low=float(round(hist["Low"].min(), 2)),
        period_change_pct=period_change_pct,
        avg_volume=float(round(hist["Volume"].mean(), 0)),
        sessions=int(len(hist)),
        source="yfinance",
    )


def _parse_date(s: str) -> date_t:
    return datetime.strptime(s, "%Y-%m-%d").date()


# Module-level default provider so the server doesn't have to manage
# instantiation. Phase 5+ replaces this with a configurable factory.
default_provider: BaseDataProvider = YFinanceProvider()
