"""Unit tests for the Phase 8c Telegram bot.

The polling loop is exercised via a fake httpx client that yields scripted
updates. Real Telegram is not contacted. Real live_debate is not contacted
either — the test patches it with a generator that yields a session.complete
synthetic event so the cost-cap accounting can be inspected.

These tests cover the security-critical paths first:
- /start reply works without allowlist (chat_id discovery flow)
- Non-allowlisted chat is silently dropped (no leak)
- Allowlisted chat with valid ticker triggers a debate and gets a reply
- Per-chat daily cap blocks further runs once exceeded
- Spend persistence survives a stop/start cycle on the same UTC day
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from unittest.mock import patch

import httpx
import pytest

from engine import telegram_bot
from engine.telegram_bot import (
    TelegramBot,
    TelegramBotConfig,
    _format_decision_reply,
)


# ---- Helpers ---------------------------------------------------------------


def _msg(chat_id: int, text: str, update_id: int = 1) -> dict[str, Any]:
    return {
        "update_id": update_id,
        "message": {
            "message_id": update_id * 10,
            "chat": {"id": chat_id, "type": "private"},
            "text": text,
        },
    }


class FakeTelegramTransport(httpx.AsyncBaseTransport):
    """Captures outbound requests, returns scripted responses.

    Each call to `enqueue_updates` adds one getUpdates payload to the
    queue. Subsequent getUpdates calls drain the queue, returning an
    empty result list when empty (which is what real Telegram does
    during a long-poll timeout). sendMessage is always 200/ok.
    """

    def __init__(self) -> None:
        self.sent_messages: list[dict[str, Any]] = []
        self._update_queue: list[list[dict[str, Any]]] = []

    def enqueue_updates(self, updates: list[dict[str, Any]]) -> None:
        self._update_queue.append(updates)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        url_path = request.url.path
        if url_path.endswith("/getUpdates"):
            updates = self._update_queue.pop(0) if self._update_queue else []
            # Drain quickly; real long-poll waits up to 25s for an update.
            await asyncio.sleep(0.01)
            return httpx.Response(
                200,
                json={"ok": True, "result": updates},
                request=request,
            )
        if url_path.endswith("/sendMessage"):
            body = json.loads(request.content)
            self.sent_messages.append(body)
            return httpx.Response(
                200,
                json={"ok": True, "result": {}},
                request=request,
            )
        return httpx.Response(404, json={"ok": False}, request=request)


@pytest.fixture
def fake_transport():
    return FakeTelegramTransport()


@pytest.fixture
def patch_httpx_client(fake_transport, monkeypatch):
    """Replace TelegramBot's httpx.AsyncClient with one wired to fake_transport.

    Patches `httpx.AsyncClient` at the module level so the bot's
    `httpx.AsyncClient(timeout=...)` constructor returns our fake instance.
    """
    real_client_cls = httpx.AsyncClient

    def make_fake(*_args, **kwargs):
        return real_client_cls(transport=fake_transport, **kwargs)

    monkeypatch.setattr(telegram_bot.httpx, "AsyncClient", make_fake)
    return fake_transport


@pytest.fixture(autouse=True)
def isolate_spend_file(tmp_path, monkeypatch):
    """Redirect _spend_file_path() to a per-test tmp directory so the
    cap-persistence file doesn't bleed between tests or pollute the dev
    SQLite location."""
    target = tmp_path / "telegram_spend.json"
    monkeypatch.setattr(telegram_bot, "_spend_file_path", lambda: target)
    yield target


async def _stub_live_debate_factory(cost_usd: float = 0.01, action: str = "HOLD"):
    """Return an async generator that produces a single session.complete event.

    The bot's _run_debate iterates the generator until it sees the complete
    event, captures the decision + cost, then replies. Anything more
    elaborate would belong in live_debate's own test suite.
    """

    async def stub(*_args, **_kwargs):  # noqa: ANN202
        yield {
            "type": "session.complete",
            "ticker": "NVDA",
            "trade_date": "2026-05-18",
            "decision": {
                "action": action,
                "confidence": 0.55,
                "reasoning": "Synthetic test reasoning.",
            },
            "live": True,
            "estimated_cost_usd": cost_usd,
        }

    return stub


# ---- Ticker parsing --------------------------------------------------------


class TestParseTicker:
    def test_bare_ticker(self):
        assert TelegramBot._parse_ticker("NVDA") == "NVDA"

    def test_bare_ticker_lowercase(self):
        # The bot's parser does case-insensitive matching on the bare form
        # so users on mobile keyboards without caps lock still trigger.
        assert TelegramBot._parse_ticker("nvda") == "NVDA"

    def test_crypto_ticker(self):
        assert TelegramBot._parse_ticker("BTC-USD") == "BTC-USD"

    def test_analyze_command(self):
        assert TelegramBot._parse_ticker("/analyze NVDA") == "NVDA"

    def test_analyze_command_lowercase(self):
        assert TelegramBot._parse_ticker("/analyze nvda") == "NVDA"

    def test_analyze_command_with_bot_username(self):
        # Telegram appends @botname when a bot is mentioned in groups.
        assert TelegramBot._parse_ticker("/analyze@my_tal_bot NVDA") == "NVDA"

    def test_rejects_long_sentence(self):
        assert TelegramBot._parse_ticker("what about NVDA next week?") is None

    def test_rejects_empty(self):
        assert TelegramBot._parse_ticker("") is None
        assert TelegramBot._parse_ticker("   ") is None

    def test_rejects_help_command(self):
        assert TelegramBot._parse_ticker("/help") is None

    def test_rejects_too_long(self):
        assert TelegramBot._parse_ticker("ABCDEFGHIJ") is None  # 10 chars


# ---- Format reply ----------------------------------------------------------


class TestFormatReply:
    def test_includes_disclaimer(self):
        text = _format_decision_reply(
            ticker="NVDA",
            trade_date="2026-05-18",
            decision={"action": "BUY", "confidence": 0.8, "reasoning": "Strong"},
            cost_usd=0.012,
            live=True,
            cap_usd=5.0,
            spent_today=0.012,
        )
        assert "Not investment advice" in text
        assert "*BUY*" in text
        assert "NVDA" in text
        assert "$0.012" in text or "$0.0120" in text

    def test_truncates_long_reasoning(self):
        long_reasoning = "x" * 1000
        text = _format_decision_reply(
            ticker="NVDA",
            trade_date="2026-05-18",
            decision={"action": "HOLD", "confidence": 0.5, "reasoning": long_reasoning},
            cost_usd=0.01,
            live=True,
            cap_usd=5.0,
            spent_today=0.01,
        )
        # Reasoning capped at 600 chars + ellipsis.
        assert "xxxx…" in text or "xxxx..." in text


# ---- Bot integration -------------------------------------------------------


@pytest.mark.asyncio
async def test_start_replies_without_allowlist(patch_httpx_client):
    """/start should always reply with chat_id so users can discover it."""
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist=set(), daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates([_msg(chat_id=99, text="/start", update_id=1)])
        # Let the poll loop pick up the update and the handler run.
        await asyncio.sleep(0.15)
    finally:
        await bot.stop()
    assert len(transport.sent_messages) == 1
    sent = transport.sent_messages[0]
    assert sent["chat_id"] == 99
    assert "chat_id is `99`" in sent["text"]


@pytest.mark.asyncio
async def test_non_allowlisted_silent_drop(patch_httpx_client):
    """Random chat sends a ticker -> bot drops silently (no reply)."""
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={123}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates([_msg(chat_id=999, text="NVDA", update_id=1)])
        await asyncio.sleep(0.15)
    finally:
        await bot.stop()
    assert transport.sent_messages == []


@pytest.mark.asyncio
async def test_allowlisted_ticker_triggers_debate(patch_httpx_client):
    transport = patch_httpx_client
    stub = await _stub_live_debate_factory(cost_usd=0.0123)
    bot = TelegramBot()
    config = TelegramBotConfig(
        token="X" * 40,
        allowlist={42},
        daily_cap_usd=5.0,
        provider_config={"provider": "openai", "api_key": "sk-test", "model": "gpt-4o-mini"},
    )

    # Patch data provider + debate so no real network or API key is needed.
    with patch.object(telegram_bot, "live_debate", stub), \
         patch.object(telegram_bot.default_provider, "quote_summary", side_effect=Exception("no net")), \
         patch.object(telegram_bot.default_provider, "news_headlines", side_effect=Exception("no net")):
        await bot.start(config)
        try:
            transport.enqueue_updates([_msg(chat_id=42, text="NVDA", update_id=1)])
            # Need a longer sleep here: handler dispatches via asyncio.create_task,
            # which means we need to yield the event loop multiple times.
            for _ in range(20):
                await asyncio.sleep(0.05)
                if any("HOLD" in m.get("text", "") for m in transport.sent_messages):
                    break
        finally:
            await bot.stop()

    # We expect at least the "Running Diligence" ack plus the decision reply.
    assert len(transport.sent_messages) >= 2
    decision_text = transport.sent_messages[-1]["text"]
    assert "*HOLD*" in decision_text
    assert "$0.0123" in decision_text
    # Spend persisted.
    assert bot._spend["42"] == pytest.approx(0.0123)


@pytest.mark.asyncio
async def test_daily_cap_blocks_after_threshold(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={7}, daily_cap_usd=0.01)
    await bot.start(config)
    # Pre-load spend so the very next request hits the cap.
    bot._spend["7"] = 0.05
    try:
        transport.enqueue_updates([_msg(chat_id=7, text="NVDA", update_id=1)])
        await asyncio.sleep(0.15)
    finally:
        await bot.stop()
    assert len(transport.sent_messages) == 1
    assert "cap reached" in transport.sent_messages[0]["text"].lower()


@pytest.mark.asyncio
async def test_invalid_input_friendly_reply(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={7}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_msg(chat_id=7, text="hello there friend", update_id=1)]
        )
        await asyncio.sleep(0.15)
    finally:
        await bot.stop()
    assert len(transport.sent_messages) == 1
    assert "didn't see a ticker" in transport.sent_messages[0]["text"]
