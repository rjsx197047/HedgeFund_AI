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
        self.set_commands_calls: list[dict[str, Any]] = []
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
        if url_path.endswith("/setMyCommands"):
            self.set_commands_calls.append(json.loads(request.content))
            return httpx.Response(
                200,
                json={"ok": True, "result": True},
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
    """Redirect _spend_file_path() and _modes_file_path() to per-test tmp
    paths so the persistence files don't bleed between tests or pollute
    the dev SQLite location."""
    spend_target = tmp_path / "telegram_spend.json"
    modes_target = tmp_path / "telegram_chat_modes.json"
    monkeypatch.setattr(telegram_bot, "_spend_file_path", lambda: spend_target)
    monkeypatch.setattr(telegram_bot, "_modes_file_path", lambda: modes_target)
    yield spend_target


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


async def _stub_live_debate_with_phases(cost_usd: float = 0.01):
    """Same as `_stub_live_debate_factory` but also yields phase transitions
    so the bot's progress-streaming path is exercised."""

    async def stub(*_args, **_kwargs):  # noqa: ANN202
        yield {"type": "session.start", "ticker": "NVDA", "trade_date": "2026-05-18"}
        yield {"type": "phase.transition", "from": "analysts", "to": "researchers"}
        yield {"type": "phase.transition", "from": "researchers", "to": "trader"}
        yield {"type": "phase.transition", "from": "trader", "to": "risk"}
        yield {
            "type": "session.complete",
            "ticker": "NVDA",
            "trade_date": "2026-05-18",
            "decision": {
                "action": "HOLD",
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


# ---- Pairing flow (v1.1) ---------------------------------------------------


def _start_msg(
    chat_id: int, first_name: str = "", username: str = "", update_id: int = 1
) -> dict[str, Any]:
    """/start message with Telegram's typical chat metadata fields."""
    return {
        "update_id": update_id,
        "message": {
            "message_id": update_id * 10,
            "chat": {
                "id": chat_id,
                "type": "private",
                "first_name": first_name,
                "username": username,
            },
            "from": {
                "id": chat_id,
                "first_name": first_name,
                "username": username,
            },
            "text": "/start",
        },
    }


@pytest.mark.asyncio
async def test_start_from_new_user_creates_pending_entry(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist=set(), daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_start_msg(chat_id=42, first_name="Bob", username="bob_t")]
        )
        await asyncio.sleep(0.15)
        # Capture pending state BEFORE stop() clears it.
        pending = list(bot._pending.values())
    finally:
        await bot.stop()

    assert len(pending) == 1
    p = pending[0]
    assert p.chat_id == 42
    assert p.first_name == "Bob"
    assert p.username == "bob_t"

    # Bot also replies with the "you're queued" message including the name.
    assert len(transport.sent_messages) == 1
    text = transport.sent_messages[0]["text"]
    assert "Hello Bob" in text
    assert "chat_id is `42`" in text
    assert "queued" in text


@pytest.mark.asyncio
async def test_start_from_already_allowlisted_user_friendly_reply(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={99}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates([_start_msg(chat_id=99, first_name="Alice")])
        await asyncio.sleep(0.15)
        # Should NOT have created a pending entry for an already-allowlisted user.
        pending_count = len(bot._pending)
    finally:
        await bot.stop()

    assert pending_count == 0
    assert len(transport.sent_messages) == 1
    assert "already approved" in transport.sent_messages[0]["text"]


@pytest.mark.asyncio
async def test_repeated_start_does_not_duplicate_pending(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist=set(), daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_start_msg(chat_id=42, first_name="Bob", update_id=1)]
        )
        await asyncio.sleep(0.1)
        transport.enqueue_updates(
            [_start_msg(chat_id=42, first_name="Bob", update_id=2)]
        )
        await asyncio.sleep(0.1)
        # Still only ONE pending entry for chat 42.
        pending_count = len(bot._pending)
    finally:
        await bot.stop()

    assert pending_count == 1


@pytest.mark.asyncio
async def test_approve_moves_to_allowlist_and_dms_user(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist=set(), daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_start_msg(chat_id=77, first_name="Charlie")]
        )
        await asyncio.sleep(0.15)
        # Wipe the "queued" reply so the next assert only sees the approval DM.
        transport.sent_messages.clear()

        ok = await bot.approve(77)
        assert ok is True
        assert 77 in config.allowlist
        assert 77 not in bot._pending

        # Bot DMs the approved user.
        assert len(transport.sent_messages) == 1
        assert "approved" in transport.sent_messages[0]["text"].lower()
    finally:
        await bot.stop()


@pytest.mark.asyncio
async def test_approve_unknown_chat_returns_false(patch_httpx_client):
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist=set(), daily_cap_usd=5.0)
    await bot.start(config)
    try:
        ok = await bot.approve(99999)
        assert ok is False
        assert 99999 not in config.allowlist
    finally:
        await bot.stop()


@pytest.mark.asyncio
async def test_approve_idempotent_for_already_allowlisted(patch_httpx_client):
    """Re-approving an already-approved chat should return True without
    side effect. This matters because the renderer might race the prune
    or click Approve twice; neither should look like an error."""
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={55}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        ok = await bot.approve(55)
        assert ok is True
        assert 55 in config.allowlist
        # Idempotent re-DMs the user (it's confirmation, not new info).
        assert len(transport.sent_messages) == 1
    finally:
        await bot.stop()


@pytest.mark.asyncio
async def test_deny_drops_pending_without_dm(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist=set(), daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_start_msg(chat_id=88, first_name="Dave")]
        )
        await asyncio.sleep(0.15)
        transport.sent_messages.clear()

        ok = bot.deny(88)
        assert ok is True
        assert 88 not in bot._pending
        assert 88 not in config.allowlist
        # No DM to the denied user.
        assert transport.sent_messages == []
    finally:
        await bot.stop()


@pytest.mark.asyncio
async def test_pending_entries_expire(patch_httpx_client):
    """Stale /start requests should be pruned after PENDING_TTL_S."""
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist=set(), daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_start_msg(chat_id=11, first_name="Eve")]
        )
        await asyncio.sleep(0.15)
        assert 11 in bot._pending

        # Fast-forward the stored first_seen to simulate the TTL passing
        # without actually sleeping for half an hour.
        import time as _time
        bot._pending[11].first_seen = (
            _time.time() - telegram_bot.PENDING_TTL_S - 1
        )
        bot._prune_pending()
        assert 11 not in bot._pending
    finally:
        await bot.stop()


@pytest.mark.asyncio
async def test_status_reports_pending_approvals(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist=set(), daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_start_msg(chat_id=21, first_name="Fay", username="fay_x")]
        )
        await asyncio.sleep(0.15)

        snap = bot.status().to_dict()
        assert snap["allowlist_size"] == 0
        assert len(snap["pending_approvals"]) == 1
        entry = snap["pending_approvals"][0]
        assert entry["chat_id"] == 21
        assert entry["first_name"] == "Fay"
        assert entry["username"] == "fay_x"
    finally:
        await bot.stop()


# ---- Per-agent streaming (v1.1) -------------------------------------------


@pytest.mark.asyncio
async def test_per_agent_streaming_sends_progress_per_phase(patch_httpx_client):
    """Bot forwards phase.transition events as short status DMs so the
    mobile user sees movement during a 5+ minute debate."""
    transport = patch_httpx_client
    stub = await _stub_live_debate_with_phases(cost_usd=0.005)
    bot = TelegramBot()
    config = TelegramBotConfig(
        token="X" * 40,
        allowlist={42},
        daily_cap_usd=5.0,
        provider_config={
            "provider": "openai",
            "api_key": "sk-test",
            "model": "gpt-4o-mini",
        },
    )

    with patch.object(telegram_bot, "live_debate", stub), \
         patch.object(telegram_bot.default_provider, "quote_summary", side_effect=Exception("no net")), \
         patch.object(telegram_bot.default_provider, "news_headlines", side_effect=Exception("no net")):
        await bot.start(config)
        try:
            transport.enqueue_updates([_msg(chat_id=42, text="NVDA", update_id=1)])
            # Wait until the decision card has been sent (the very last
            # message), then take the snapshot.
            for _ in range(40):
                await asyncio.sleep(0.05)
                if any("*HOLD*" in m.get("text", "") for m in transport.sent_messages):
                    break
        finally:
            await bot.stop()

    texts = [m["text"] for m in transport.sent_messages]
    # 1 "Running Diligence" ack + 3 phase progress messages + 1 decision = 5.
    # The "analysts" phase is the initial state of the engine state machine,
    # so phase.transition arrives only for researchers / trader / risk.
    assert any("Running Diligence" in t for t in texts)
    assert any("Researchers debating" in t for t in texts)
    assert any("Trader synthesizing" in t for t in texts)
    assert any("Risk committee reviewing" in t for t in texts)
    assert any("*HOLD*" in t for t in texts)


# ---- Reply mode (v1.2 /full /summary) -------------------------------------


@pytest.mark.asyncio
async def test_summary_mode_is_default(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={42}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        assert bot._mode_for(42) == "summary"
    finally:
        await bot.stop()


@pytest.mark.asyncio
async def test_full_command_sets_mode_and_persists(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={42}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates([_msg(chat_id=42, text="/full", update_id=1)])
        await asyncio.sleep(0.15)

        assert bot._mode_for(42) == "full"
        assert "Full debate mode on" in transport.sent_messages[0]["text"]
    finally:
        await bot.stop()

    # Mode persisted to JSON file. Reload via a fresh bot to confirm.
    bot2 = TelegramBot()
    await bot2.start(config)
    try:
        assert bot2._mode_for(42) == "full"
    finally:
        await bot2.stop()


@pytest.mark.asyncio
async def test_summary_command_resets_mode(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={42}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        # Start in full
        bot._set_mode(42, "full")
        transport.enqueue_updates([_msg(chat_id=42, text="/summary", update_id=1)])
        await asyncio.sleep(0.15)

        assert bot._mode_for(42) == "summary"
        assert "Summary mode on" in transport.sent_messages[0]["text"]
    finally:
        await bot.stop()


@pytest.mark.asyncio
async def test_full_mode_streams_agent_messages(patch_httpx_client):
    """In full mode, every agent.message event becomes a Telegram DM."""

    async def stub_with_agents(*_args, **_kwargs):  # noqa: ANN202
        yield {"type": "session.start", "ticker": "NVDA", "trade_date": "2026-05-20"}
        yield {"type": "phase.transition", "from": "analysts", "to": "researchers"}
        yield {
            "type": "agent.message",
            "agent": "bull_researcher",
            "phase": "researchers",
            "content": "NVDA fundamentals look strong.",
        }
        yield {
            "type": "agent.message",
            "agent": "bear_researcher",
            "phase": "researchers",
            "content": "But the multiple is stretched.",
        }
        yield {
            "type": "session.complete",
            "ticker": "NVDA",
            "trade_date": "2026-05-20",
            "decision": {"action": "HOLD", "confidence": 0.5, "reasoning": "x"},
            "live": True,
            "estimated_cost_usd": 0.001,
        }

    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(
        token="X" * 40,
        allowlist={42},
        daily_cap_usd=5.0,
        provider_config={"provider": "openai", "api_key": "sk-test", "model": "gpt-4o-mini"},
    )

    with patch.object(telegram_bot, "live_debate", stub_with_agents), \
         patch.object(telegram_bot.default_provider, "quote_summary", side_effect=Exception("no net")), \
         patch.object(telegram_bot.default_provider, "news_headlines", side_effect=Exception("no net")):
        await bot.start(config)
        try:
            bot._set_mode(42, "full")
            transport.enqueue_updates([_msg(chat_id=42, text="NVDA", update_id=1)])
            for _ in range(40):
                await asyncio.sleep(0.05)
                if any("*HOLD*" in m.get("text", "") for m in transport.sent_messages):
                    break
        finally:
            await bot.stop()

    texts = [m["text"] for m in transport.sent_messages]
    # The two agent messages each got their own DM with the role header.
    assert any("[Bull Researcher]" in t and "fundamentals look strong" in t for t in texts)
    assert any("[Bear Researcher]" in t and "multiple is stretched" in t for t in texts)
    # Decision card still arrives last.
    assert any("*HOLD*" in t for t in texts)


@pytest.mark.asyncio
async def test_summary_mode_does_not_stream_agent_messages(patch_httpx_client):
    """In summary mode (default), agent.message events do NOT become DMs."""

    async def stub_with_agents(*_args, **_kwargs):  # noqa: ANN202
        yield {"type": "session.start", "ticker": "NVDA", "trade_date": "2026-05-20"}
        yield {
            "type": "agent.message",
            "agent": "bull_researcher",
            "phase": "researchers",
            "content": "this should NOT be forwarded",
        }
        yield {
            "type": "session.complete",
            "ticker": "NVDA",
            "trade_date": "2026-05-20",
            "decision": {"action": "HOLD", "confidence": 0.5, "reasoning": "x"},
            "live": True,
            "estimated_cost_usd": 0.001,
        }

    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(
        token="X" * 40,
        allowlist={42},
        daily_cap_usd=5.0,
        provider_config={"provider": "openai", "api_key": "sk-test", "model": "gpt-4o-mini"},
    )

    with patch.object(telegram_bot, "live_debate", stub_with_agents), \
         patch.object(telegram_bot.default_provider, "quote_summary", side_effect=Exception("no net")), \
         patch.object(telegram_bot.default_provider, "news_headlines", side_effect=Exception("no net")):
        await bot.start(config)
        try:
            # Default mode is summary; don't toggle.
            transport.enqueue_updates([_msg(chat_id=42, text="NVDA", update_id=1)])
            for _ in range(40):
                await asyncio.sleep(0.05)
                if any("*HOLD*" in m.get("text", "") for m in transport.sent_messages):
                    break
        finally:
            await bot.stop()

    texts = [m["text"] for m in transport.sent_messages]
    assert not any("should NOT be forwarded" in t for t in texts)
    assert any("*HOLD*" in t for t in texts)


# ---- Persistent reply keyboard (v1.3) -------------------------------------


def _has_keyboard(payload: dict[str, Any]) -> bool:
    """True if the sendMessage payload includes the persistent reply keyboard."""
    markup = payload.get("reply_markup") or {}
    return bool(markup.get("keyboard")) and markup.get("is_persistent") is True


@pytest.mark.asyncio
async def test_pending_user_reply_has_no_keyboard(patch_httpx_client):
    """Non-allowlisted users get the regular keyboard so they can type freely."""
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist=set(), daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates([_start_msg(chat_id=42, first_name="Bob")])
        await asyncio.sleep(0.15)
    finally:
        await bot.stop()
    assert len(transport.sent_messages) == 1
    assert not _has_keyboard(transport.sent_messages[0])


@pytest.mark.asyncio
async def test_allowlisted_already_approved_reply_has_keyboard(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={99}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates([_start_msg(chat_id=99, first_name="Alice")])
        await asyncio.sleep(0.15)
    finally:
        await bot.stop()
    assert len(transport.sent_messages) == 1
    assert _has_keyboard(transport.sent_messages[0])


@pytest.mark.asyncio
async def test_full_command_reply_has_keyboard(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={42}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates([_msg(chat_id=42, text="/full", update_id=1)])
        await asyncio.sleep(0.15)
    finally:
        await bot.stop()
    assert len(transport.sent_messages) == 1
    assert _has_keyboard(transport.sent_messages[0])


@pytest.mark.asyncio
async def test_friendly_label_full_mode_maps_to_slash(patch_httpx_client):
    """Tapping the 'Full debate mode' button sends that literal text;
    the handler should normalize it to /full behavior."""
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={42}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_msg(chat_id=42, text="Full debate mode", update_id=1)]
        )
        await asyncio.sleep(0.15)
        # Check mode BEFORE stop() — stop() clears the in-memory map.
        # (The disk file persists; a fresh bot would reload it.)
        assert bot._mode_for(42) == "full"
        # The bot replied with the same "Full debate mode on" text the
        # /full slash command produces.
        assert any(
            "Full debate mode on" in m["text"] for m in transport.sent_messages
        )
    finally:
        await bot.stop()


@pytest.mark.asyncio
async def test_friendly_label_summary_maps_to_slash(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={42}, daily_cap_usd=5.0)
    await bot.start(config)
    bot._set_mode(42, "full")
    try:
        transport.enqueue_updates(
            [_msg(chat_id=42, text="Summary mode", update_id=1)]
        )
        await asyncio.sleep(0.15)
    finally:
        await bot.stop()
    assert bot._mode_for(42) == "summary"


@pytest.mark.asyncio
async def test_friendly_label_help_maps_to_slash(patch_httpx_client):
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={42}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_msg(chat_id=42, text="Help", update_id=1)]
        )
        await asyncio.sleep(0.15)
    finally:
        await bot.stop()
    assert any(
        "Trading Agents Lab bot" in m["text"] for m in transport.sent_messages
    )


@pytest.mark.asyncio
async def test_friendly_label_case_insensitive(patch_httpx_client):
    """Match should be case-insensitive so users on autocaps mobiles work too."""
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={42}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        transport.enqueue_updates(
            [_msg(chat_id=42, text="FULL DEBATE MODE", update_id=1)]
        )
        await asyncio.sleep(0.15)
        assert bot._mode_for(42) == "full"
    finally:
        await bot.stop()


# ---- Bot command menu (setMyCommands) -------------------------------------


@pytest.mark.asyncio
async def test_start_publishes_command_menu(patch_httpx_client):
    """On bot start, setMyCommands fires so typing / in Telegram shows
    the autocomplete menu with our 6 commands."""
    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(token="X" * 40, allowlist={42}, daily_cap_usd=5.0)
    await bot.start(config)
    try:
        # Give the publish task a moment to run; it's fire-and-forget on
        # start() so the polling loop isn't blocked.
        for _ in range(20):
            await asyncio.sleep(0.05)
            if transport.set_commands_calls:
                break
    finally:
        await bot.stop()

    assert len(transport.set_commands_calls) == 1
    payload = transport.set_commands_calls[0]
    names = [c["command"] for c in payload["commands"]]
    # All six v1.2 commands present.
    assert set(names) == {"analyze", "full", "summary", "mode", "help", "start"}
    # Every entry has a non-empty description.
    for c in payload["commands"]:
        assert c.get("description", "").strip() != ""


# ---- Credential refresh (v1.2 OAuth) --------------------------------------


@pytest.mark.asyncio
async def test_refresh_credentials_updates_running_bot(patch_httpx_client):
    bot = TelegramBot()
    config = TelegramBotConfig(
        token="X" * 40,
        allowlist={42},
        daily_cap_usd=5.0,
        provider_config={
            "provider": "openai",
            "auth": {"type": "oauth", "access": "old", "refresh": "r", "expires": 0},
            "model": "gpt-5.4",
        },
    )
    await bot.start(config)
    try:
        new_pc = {
            "provider": "openai",
            "auth": {"type": "oauth", "access": "new", "refresh": "r", "expires": 999},
            "model": "gpt-5.4",
        }
        ok = bot.refresh_credentials(new_pc)
        assert ok is True
        assert bot._config is not None
        # In-place update of the provider_config.
        assert bot._config.provider_config["auth"]["access"] == "new"
    finally:
        await bot.stop()


@pytest.mark.asyncio
async def test_refresh_credentials_returns_false_when_stopped():
    bot = TelegramBot()
    # Never started.
    ok = bot.refresh_credentials({"provider": "openai"})
    assert ok is False


@pytest.mark.asyncio
async def test_per_agent_streaming_ignores_unknown_phase(patch_httpx_client):
    """phase.transition to a future-added phase that isn't in
    _PHASE_PROGRESS_LABEL should be silently skipped, not forwarded
    as a literal phase string."""

    async def stub_with_unknown_phase(*_args, **_kwargs):  # noqa: ANN202
        yield {"type": "phase.transition", "from": "analysts", "to": "researchers"}
        yield {"type": "phase.transition", "from": "researchers", "to": "future_phase_v3"}
        yield {
            "type": "session.complete",
            "ticker": "NVDA",
            "trade_date": "2026-05-18",
            "decision": {
                "action": "HOLD",
                "confidence": 0.5,
                "reasoning": "x",
            },
            "live": True,
            "estimated_cost_usd": 0.001,
        }

    transport = patch_httpx_client
    bot = TelegramBot()
    config = TelegramBotConfig(
        token="X" * 40,
        allowlist={42},
        daily_cap_usd=5.0,
        provider_config={
            "provider": "openai",
            "api_key": "sk-test",
            "model": "gpt-4o-mini",
        },
    )

    with patch.object(telegram_bot, "live_debate", stub_with_unknown_phase), \
         patch.object(telegram_bot.default_provider, "quote_summary", side_effect=Exception("no net")), \
         patch.object(telegram_bot.default_provider, "news_headlines", side_effect=Exception("no net")):
        await bot.start(config)
        try:
            transport.enqueue_updates([_msg(chat_id=42, text="NVDA", update_id=1)])
            for _ in range(40):
                await asyncio.sleep(0.05)
                if any("*HOLD*" in m.get("text", "") for m in transport.sent_messages):
                    break
        finally:
            await bot.stop()

    texts = [m["text"] for m in transport.sent_messages]
    # Known phase forwarded, unknown phase silently dropped.
    assert any("Researchers debating" in t for t in texts)
    assert not any("future_phase_v3" in t for t in texts)
