"""AlpacaProvider — locked-in safety + selection logic tests.

Doesn't hit the live Alpaca API. Verifies:
- The base URL constant points only at data.alpaca.markets (locked
  positioning — must never resolve to api.alpaca.markets)
- AlpacaProvider rejects empty credentials
- provider_from_data_config returns None for malformed configs and an
  AlpacaProvider for valid ones
- AlpacaProvider builds the expected URL + query params for the bars
  endpoint (free-tier-compatible: feed=sip, end ≥15 min ago)

Network-mocked via httpx's MockTransport. No real network calls.
"""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from engine.data_providers import (
    ALPACA_DATA_BASE_URL,
    AlpacaProvider,
    DataUnavailable,
    QuoteSummary,
    YFinanceProvider,
    provider_from_data_config,
)


# ---- Locked-in safety ------------------------------------------------------


def test_alpaca_base_url_is_data_endpoint_only():
    """Locked positioning: AlpacaProvider must NEVER point at the live
    trading endpoint (api.alpaca.markets). The constant is the entire
    safety guarantee — defense in depth via endpoint constants, not
    runtime guard flags."""
    assert ALPACA_DATA_BASE_URL == "https://data.alpaca.markets"
    assert "api.alpaca.markets" not in ALPACA_DATA_BASE_URL


def test_alpaca_provider_rejects_empty_credentials():
    with pytest.raises(ValueError):
        AlpacaProvider(key_id="", secret="abc")
    with pytest.raises(ValueError):
        AlpacaProvider(key_id="abc", secret="")
    with pytest.raises(ValueError):
        AlpacaProvider(key_id="", secret="")


def test_alpaca_provider_name_is_alpaca():
    p = AlpacaProvider(key_id="PK_TEST", secret="secret_test")
    assert p.name == "alpaca"


# ---- provider_from_data_config dispatch ------------------------------------


def test_provider_from_data_config_returns_none_when_absent():
    assert provider_from_data_config(None) is None
    assert provider_from_data_config({}) is None


def test_provider_from_data_config_returns_none_for_unknown_provider():
    assert provider_from_data_config({"provider": "bloomberg", "key_id": "x", "secret": "y"}) is None


def test_provider_from_data_config_returns_none_when_missing_credentials():
    assert provider_from_data_config({"provider": "alpaca", "key_id": "x"}) is None
    assert provider_from_data_config({"provider": "alpaca", "secret": "y"}) is None
    assert provider_from_data_config({"provider": "alpaca", "key_id": "", "secret": "y"}) is None


def test_provider_from_data_config_returns_alpaca_provider_when_valid():
    p = provider_from_data_config(
        {"provider": "alpaca", "key_id": "PK_TEST", "secret": "secret_test"}
    )
    assert isinstance(p, AlpacaProvider)
    assert p.name == "alpaca"


def test_provider_from_data_config_normalizes_provider_case():
    p = provider_from_data_config(
        {"provider": "Alpaca", "key_id": "PK_TEST", "secret": "secret_test"}
    )
    assert isinstance(p, AlpacaProvider)


# ---- HTTP shape — using httpx MockTransport (no real network) -------------


@pytest.mark.asyncio
async def test_alpaca_quote_summary_builds_correct_request():
    """Verify the URL, query params, and headers we send to Alpaca."""
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        # Return a minimal successful body — 3 bars
        return httpx.Response(
            200,
            json={
                "bars": [
                    {"t": "2026-05-06T20:00:00Z", "o": 100.0, "h": 102.0, "l": 99.0, "c": 101.0, "v": 1_000_000},
                    {"t": "2026-05-07T20:00:00Z", "o": 101.0, "h": 103.5, "l": 100.5, "c": 103.0, "v": 1_200_000},
                    {"t": "2026-05-08T20:00:00Z", "o": 103.0, "h": 105.0, "l": 102.0, "c": 104.5, "v": 1_500_000},
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    # Patch httpx.AsyncClient to use our transport for this test only.
    real_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client(*args, **kwargs)

    import httpx as httpx_mod
    httpx_mod.AsyncClient = patched_client  # type: ignore[assignment]
    try:
        p = AlpacaProvider(key_id="PK_TEST", secret="secret_test")
        summary = await p.quote_summary(ticker="nvda", trade_date="2026-05-09", lookback_days=24)
    finally:
        httpx_mod.AsyncClient = real_client  # type: ignore[assignment]

    assert len(captured) == 1
    req = captured[0]
    assert str(req.url).startswith("https://data.alpaca.markets/v2/stocks/NVDA/bars")
    # Query params
    qp = dict(req.url.params)
    assert qp["timeframe"] == "1Day"
    assert qp["feed"] == "sip"
    assert "end" in qp and "start" in qp
    # Auth headers
    assert req.headers["APCA-API-KEY-ID"] == "PK_TEST"
    assert req.headers["APCA-API-SECRET-KEY"] == "secret_test"
    # Result mapping
    assert isinstance(summary, QuoteSummary)
    assert summary.source == "alpaca"
    assert summary.ticker == "NVDA"
    assert summary.last_close == 104.50
    assert summary.period_open == 100.0
    assert summary.sessions == 3


@pytest.mark.asyncio
async def test_alpaca_quote_summary_raises_on_401():
    """Bad credentials must raise DataUnavailable with a helpful message."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="invalid credentials")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client(*args, **kwargs)

    import httpx as httpx_mod
    httpx_mod.AsyncClient = patched_client  # type: ignore[assignment]
    try:
        p = AlpacaProvider(key_id="bad", secret="bad")
        with pytest.raises(DataUnavailable) as exc_info:
            await p.quote_summary(ticker="NVDA", trade_date="2026-05-09")
    finally:
        httpx_mod.AsyncClient = real_client  # type: ignore[assignment]

    msg = str(exc_info.value)
    assert "401" in msg or "credentials" in msg.lower()
    # Helpful hint about paper-vs-live keys
    assert "paper" in msg.lower() or "live" in msg.lower()


@pytest.mark.asyncio
async def test_alpaca_quote_summary_raises_on_empty_bars():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"bars": []})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client(*args, **kwargs)

    import httpx as httpx_mod
    httpx_mod.AsyncClient = patched_client  # type: ignore[assignment]
    try:
        p = AlpacaProvider(key_id="PK_TEST", secret="secret_test")
        with pytest.raises(DataUnavailable):
            await p.quote_summary(ticker="UNKNOWN", trade_date="2026-05-09")
    finally:
        httpx_mod.AsyncClient = real_client  # type: ignore[assignment]


@pytest.mark.asyncio
async def test_alpaca_news_returns_empty_list_on_failure():
    """News failures must not raise — they degrade silently to empty list,
    matching the existing yfinance behavior. Bars failures DO raise (we
    want loud signal that data is missing); news is supplementary."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="internal server error")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client(*args, **kwargs)

    import httpx as httpx_mod
    httpx_mod.AsyncClient = patched_client  # type: ignore[assignment]
    try:
        p = AlpacaProvider(key_id="PK_TEST", secret="secret_test")
        out = await p.news_headlines(ticker="NVDA", limit=5)
    finally:
        httpx_mod.AsyncClient = real_client  # type: ignore[assignment]

    assert out == []


# ---- yfinance fallback unchanged when no data_config ----------------------


def test_default_provider_remains_yfinance():
    """Smoke check: default_provider has not been monkey-patched away."""
    from engine.data_providers import default_provider
    assert isinstance(default_provider, YFinanceProvider)
    assert default_provider.name == "yfinance"
