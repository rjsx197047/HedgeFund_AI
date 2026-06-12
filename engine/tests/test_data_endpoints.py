"""Input validation on /data/* endpoints + the yfinance response cache.

Regression coverage for two QA findings (2026-06-11):

1. A malformed ticker or trade_date used to surface as a 502 "data
   provider error" (the generic provider-exception catch swallowed the
   ValueError from normalize_ticker / date parsing). Bad input is the
   caller's fault — it must be a 422, and the renderer must not render a
   provider outage for it.

2. Yahoo rate-limits aggressively (HTTP 429) while the app legitimately
   requests the same (ticker, trade_date) summary several times in quick
   succession. The provider now serves repeats from a short-TTL
   in-process cache.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from engine import data_providers
from engine.data_providers import Headline, QuoteSummary, YFinanceProvider
from engine.server import build_app

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(tmp_db):
    app = build_app(token=TOKEN)
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clear_yf_cache():
    data_providers._yf_cache.clear()
    yield
    data_providers._yf_cache.clear()


# ---- 422 validation ---------------------------------------------------------


def test_summary_rejects_malformed_ticker(client):
    r = client.get(
        "/data/summary",
        params={"ticker": "NOT A TICKER!!", "trade_date": "2026-06-10"},
        headers=AUTH,
    )
    assert r.status_code == 422
    assert "ticker" in r.json()["detail"].lower()


def test_summary_rejects_empty_ticker(client):
    r = client.get(
        "/data/summary",
        params={"ticker": "   ", "trade_date": "2026-06-10"},
        headers=AUTH,
    )
    assert r.status_code == 422


def test_summary_rejects_malformed_trade_date(client):
    r = client.get(
        "/data/summary",
        params={"ticker": "NVDA", "trade_date": "junk"},
        headers=AUTH,
    )
    assert r.status_code == 422
    assert "trade_date" in r.json()["detail"]


def test_news_rejects_malformed_ticker(client):
    r = client.get(
        "/data/news", params={"ticker": "$$$$"}, headers=AUTH
    )
    assert r.status_code == 422


# ---- yfinance cache ---------------------------------------------------------


def _fake_summary(spec, trade_date, lookback_days) -> QuoteSummary:
    return QuoteSummary(
        ticker=spec.display,
        trade_date=trade_date,
        as_of=trade_date,
        last_close=100.0,
        period_open=95.0,
        period_high=101.0,
        period_low=94.0,
        period_change_pct=5.26,
        avg_volume=1_000_000.0,
        sessions=lookback_days,
        source="yfinance",
        asset_class=spec.asset_class,
    )


def test_quote_summary_served_from_cache(monkeypatch):
    calls = []

    def counting_fetch(spec, trade_date, lookback_days):
        calls.append(spec.yfinance_symbol)
        return _fake_summary(spec, trade_date, lookback_days)

    monkeypatch.setattr(data_providers, "_yfinance_quote_summary", counting_fetch)
    provider = YFinanceProvider()

    async def run():
        a = await provider.quote_summary(ticker="NVDA", trade_date="2026-06-10")
        b = await provider.quote_summary(ticker="NVDA", trade_date="2026-06-10")
        # Different date — separate cache entry, second real fetch.
        c = await provider.quote_summary(ticker="NVDA", trade_date="2026-06-09")
        return a, b, c

    a, b, c = asyncio.run(run())
    assert calls == ["NVDA", "NVDA"]  # second identical request was cached
    assert a.last_close == b.last_close == c.last_close == 100.0


def test_quote_summary_cache_expires(monkeypatch):
    calls = []

    def counting_fetch(spec, trade_date, lookback_days):
        calls.append(spec.yfinance_symbol)
        return _fake_summary(spec, trade_date, lookback_days)

    monkeypatch.setattr(data_providers, "_yfinance_quote_summary", counting_fetch)
    monkeypatch.setattr(data_providers, "_YF_CACHE_TTL_SECONDS", 0)
    provider = YFinanceProvider()

    async def run():
        await provider.quote_summary(ticker="NVDA", trade_date="2026-06-10")
        await provider.quote_summary(ticker="NVDA", trade_date="2026-06-10")

    asyncio.run(run())
    assert calls == ["NVDA", "NVDA"]  # TTL 0 — nothing served from cache


def test_news_served_from_cache(monkeypatch):
    calls = []

    def counting_fetch(symbol, limit):
        calls.append(symbol)
        return [
            Headline(
                title="t", publisher="p", pub_date="2026-06-10T00:00:00Z",
                url="https://example.com", summary="s",
            )
        ]

    monkeypatch.setattr(data_providers, "_yfinance_news_headlines", counting_fetch)
    provider = YFinanceProvider()

    async def run():
        await provider.news_headlines(ticker="NVDA", limit=5)
        await provider.news_headlines(ticker="NVDA", limit=5)
        # Different limit — distinct cache key.
        await provider.news_headlines(ticker="NVDA", limit=3)

    asyncio.run(run())
    assert calls == ["NVDA", "NVDA"]


def test_empty_news_not_cached(monkeypatch):
    """An empty headline list (transient outage) must not poison the cache."""
    calls = []

    def flaky_fetch(symbol, limit):
        calls.append(symbol)
        return [] if len(calls) == 1 else [
            Headline(
                title="t", publisher="p", pub_date="2026-06-10T00:00:00Z",
                url="https://example.com", summary="s",
            )
        ]

    monkeypatch.setattr(data_providers, "_yfinance_news_headlines", flaky_fetch)
    provider = YFinanceProvider()

    async def run():
        first = await provider.news_headlines(ticker="NVDA", limit=5)
        second = await provider.news_headlines(ticker="NVDA", limit=5)
        return first, second

    first, second = asyncio.run(run())
    assert first == []
    assert len(second) == 1  # retried for real, not served stale-empty
