"""Data provider abstraction for the TradingAgentsLab engine.

Phase 5 introduces a `BaseDataProvider` interface so the engine can swap
between data sources (yfinance default, Alpaca optional, others later)
without leaking implementation details into the agent layer.

Phase 5b adds `AlpacaProvider` for users with Alpaca Markets API keys.
The renderer passes credentials on the WS start frame; engine picks the
provider per-stream based on whether `data_config` arrived.

## Locked positioning constraint

Per CLAUDE.md §3 + memory `project_positioning_analysis_only.md`,
TradingAgentsLab is an analysis tool, not an execution platform. The
`AlpacaProvider` MUST connect only to `data.alpaca.markets`. The live
trading endpoint `api.alpaca.markets` does not appear anywhere in this
file. If a user pastes a live key, requests still go to the data
endpoint — they'll fail authentication or rate-limit, but cannot
accidentally place an order. Defense in depth via endpoint constants.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import date as date_t, datetime, timedelta, timezone
from typing import Optional, Protocol

import httpx


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


@dataclass
class Headline:
    title: str
    publisher: str
    pub_date: str    # ISO-8601 UTC
    url: str
    summary: str


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

    async def news_headlines(
        self, *, ticker: str, limit: int = 5
    ) -> list[Headline]: ...


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

    async def news_headlines(
        self, *, ticker: str, limit: int = 5
    ) -> list[Headline]:
        import asyncio

        return await asyncio.to_thread(_yfinance_news_headlines, ticker, limit)


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


def _yfinance_news_headlines(ticker: str, limit: int) -> list[Headline]:
    import yfinance as yf

    yt = yf.Ticker(ticker.upper())
    raw = yt.news or []
    headlines: list[Headline] = []
    for item in raw[: max(0, limit)]:
        # The `t.news` shape is {id, content: {...}} with title, summary,
        # pubDate, provider, canonicalUrl, etc. Be defensive — Yahoo has
        # changed this shape before.
        content = item.get("content") if isinstance(item, dict) else None
        if not isinstance(content, dict):
            continue
        title = (content.get("title") or "").strip()
        if not title:
            continue
        summary = (content.get("summary") or content.get("description") or "").strip()
        pub_date = (content.get("pubDate") or content.get("displayTime") or "").strip()
        provider = content.get("provider") or {}
        publisher = (
            provider.get("displayName")
            if isinstance(provider, dict)
            else ""
        ) or ""
        url_holder = content.get("canonicalUrl") or content.get("clickThroughUrl") or {}
        url = url_holder.get("url") if isinstance(url_holder, dict) else ""
        headlines.append(
            Headline(
                title=title,
                publisher=publisher,
                pub_date=pub_date,
                url=url or "",
                summary=summary,
            )
        )
    return headlines


def _parse_date(s: str) -> date_t:
    return datetime.strptime(s, "%Y-%m-%d").date()


# ----- AlpacaProvider (Phase 5b) -----------------------------------------

# Locked-in base URL — see file docstring. Never change to api.alpaca.markets.
ALPACA_DATA_BASE_URL = "https://data.alpaca.markets"

# Free-tier SIP requires `end` parameter ≥15 minutes in the past.
# Pad slightly to avoid clock-skew flakiness.
_ALPACA_SIP_END_DELAY_SECONDS = 16 * 60


class AlpacaProvider:
    """Alpaca Markets data adapter — free Basic tier compatible.

    Reads OHLCV bars + news from `data.alpaca.markets`. Constructor takes
    credentials directly (renderer-passed via WS start frame); this class
    never touches the encrypted secrets store.

    Wire shape:
    - Auth: `APCA-API-KEY-ID` + `APCA-API-SECRET-KEY` headers
    - Bars: GET /v2/stocks/{symbol}/bars?timeframe=1Day&limit=N&feed=sip&end=<now-16min>
    - News: GET /v1beta1/news?symbols={symbol}&limit=N
    """

    name = "alpaca"

    def __init__(self, key_id: str, secret: str) -> None:
        if not key_id or not secret:
            raise ValueError("AlpacaProvider requires both key_id and secret")
        self._key_id = key_id
        self._secret = secret

    def _headers(self) -> dict[str, str]:
        return {
            "APCA-API-KEY-ID": self._key_id,
            "APCA-API-SECRET-KEY": self._secret,
            "Accept": "application/json",
        }

    async def quote_summary(
        self, *, ticker: str, trade_date: str, lookback_days: int = 30
    ) -> QuoteSummary:
        symbol = ticker.upper()
        # Pin `end` to now-16min to satisfy the free-tier SIP recency cap.
        # Use ISO-8601 UTC.
        end_dt = datetime.now(timezone.utc) - timedelta(seconds=_ALPACA_SIP_END_DELAY_SECONDS)
        start_dt = end_dt - timedelta(days=lookback_days + 5)
        url = f"{ALPACA_DATA_BASE_URL}/v2/stocks/{symbol}/bars"
        params = {
            "timeframe": "1Day",
            "limit": str(max(1, lookback_days + 2)),
            "feed": "sip",
            "start": start_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end": end_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "adjustment": "raw",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params, headers=self._headers())
        except Exception as exc:  # noqa: BLE001 — surface as DataUnavailable
            raise DataUnavailable(
                f"alpaca request failed for {symbol}: {type(exc).__name__}: {exc}"
            ) from exc

        if resp.status_code == 401 or resp.status_code == 403:
            raise DataUnavailable(
                f"alpaca rejected credentials ({resp.status_code}). "
                "Check that you pasted PAPER keys (TradingAgentsLab connects only "
                "to data.alpaca.markets — live keys won't work here)."
            )
        if resp.status_code != 200:
            raise DataUnavailable(
                f"alpaca returned {resp.status_code} for {symbol}: {resp.text[:200]}"
            )

        body = resp.json() or {}
        bars = body.get("bars") or []
        if not bars:
            raise DataUnavailable(
                f"alpaca returned no bars for {symbol} between "
                f"{start_dt.date().isoformat()} and {end_dt.date().isoformat()}"
            )

        # Trim to the most recent lookback_days bars.
        bars = bars[-lookback_days:]
        first = bars[0]
        last = bars[-1]
        first_open = float(first.get("o") or 0.0)
        last_close = float(last.get("c") or 0.0)
        period_change_pct = (
            round((last_close - first_open) / first_open * 100, 2)
            if first_open
            else 0.0
        )
        period_high = max(float(b.get("h") or 0.0) for b in bars)
        period_low = min(float(b.get("l") or 0.0) for b in bars if b.get("l") is not None)
        avg_volume = sum(float(b.get("v") or 0.0) for b in bars) / max(1, len(bars))
        as_of = (last.get("t") or "")[:10]  # "2026-05-08T20:00:00Z" -> "2026-05-08"

        return QuoteSummary(
            ticker=symbol,
            trade_date=trade_date,
            as_of=as_of,
            last_close=round(last_close, 2),
            period_open=round(first_open, 2),
            period_high=round(period_high, 2),
            period_low=round(period_low, 2),
            period_change_pct=period_change_pct,
            avg_volume=float(round(avg_volume, 0)),
            sessions=int(len(bars)),
            source="alpaca",
        )

    async def news_headlines(
        self, *, ticker: str, limit: int = 5
    ) -> list[Headline]:
        symbol = ticker.upper()
        url = f"{ALPACA_DATA_BASE_URL}/v1beta1/news"
        params = {
            "symbols": symbol,
            "limit": str(max(1, min(limit, 50))),
            "include_content": "false",
            "sort": "desc",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params, headers=self._headers())
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(
                f"[alpaca] news request failed for {symbol}: "
                f"{type(exc).__name__}: {exc}\n"
            )
            return []

        if resp.status_code != 200:
            sys.stderr.write(
                f"[alpaca] news returned {resp.status_code} for {symbol}: "
                f"{resp.text[:200]}\n"
            )
            return []

        body = resp.json() or {}
        items = body.get("news") or []
        headlines: list[Headline] = []
        for item in items[: max(0, limit)]:
            if not isinstance(item, dict):
                continue
            title = (item.get("headline") or "").strip()
            if not title:
                continue
            summary = (item.get("summary") or "").strip()
            pub_date = (item.get("created_at") or item.get("updated_at") or "").strip()
            publisher = (item.get("source") or item.get("author") or "").strip()
            article_url = (item.get("url") or "").strip()
            headlines.append(
                Headline(
                    title=title,
                    publisher=publisher,
                    pub_date=pub_date,
                    url=article_url,
                    summary=summary,
                )
            )
        return headlines


def provider_from_data_config(
    data_config: Optional[dict],
) -> Optional[BaseDataProvider]:
    """Build a per-stream data provider from the WS start frame's data_config.

    Returns None when data_config is absent / empty / malformed — caller falls
    back to `default_provider` (yfinance). This matches the LLM provider_config
    fall-through pattern: misconfiguration degrades to defaults rather than
    erroring out the stream.
    """
    if not data_config or not isinstance(data_config, dict):
        return None
    provider = (data_config.get("provider") or "").lower().strip()
    if provider == "alpaca":
        key_id = (data_config.get("key_id") or "").strip()
        secret = (data_config.get("secret") or "").strip()
        if not key_id or not secret:
            return None
        try:
            return AlpacaProvider(key_id=key_id, secret=secret)
        except Exception:  # noqa: BLE001
            return None
    return None


# Module-level default provider so the server doesn't have to manage
# instantiation. Per-stream overrides (e.g. AlpacaProvider) build on top.
default_provider: BaseDataProvider = YFinanceProvider()
