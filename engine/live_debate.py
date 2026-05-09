"""Phase 2.1-light: real-LLM debate with sequential per-agent calls.

This is intentionally *not* a wrapper around upstream's LangGraph. We pull the
spirit of the upstream agent roles (their system prompts, their phase
structure) but call the model directly with our own minimal orchestration.
The full upstream-graph integration is a later phase; the simpler approach is
controllable, debuggable, and stays under the founder's quota.

Cost discipline (non-negotiable):
- Default model is `gpt-4o-mini`
- `max_tokens` per agent message is capped (default 400)
- Total agents per session is bounded (12 — same shape as the canned debate)
- Estimated cost per session is logged to stderr after `session.complete`

Rough budget per session at defaults: ~7,400 input tokens (each agent gets
the prior turns appended) + ~2,400 output tokens ≈ ~$0.005 USD on
`gpt-4o-mini`. Switching to `gpt-4o` is ~16× more expensive.

When a provider key is not configured, the module is not invoked at all —
the WS path falls back to the canned `stub_debate.canned_debate` instead.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional

from .data_providers import Headline, QuoteSummary

# OpenAI SDK is imported lazily inside the runner so the engine can boot
# without the dep installed (e.g. an old venv) and the WS path can fall
# through cleanly to the stub.


# ---- Cost / quota guardrails -------------------------------------------------

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_MAX_TOKENS = 400
MAX_AGENTS_PER_SESSION = 12  # same as the canned debate count

# Approx GPT-4o-mini pricing (USD / 1M tokens) as of 2026-05. Used only for the
# cost estimate logged to stderr — never relied on for billing decisions.
_COST_PER_M_TOKENS = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o":      {"input": 2.50, "output": 10.00},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
}


@dataclass
class ProviderConfig:
    """Renderer-supplied config for a single debate session."""

    provider: str = "openai"
    api_key: str = ""
    model: str = DEFAULT_MODEL
    max_tokens: int = DEFAULT_MAX_TOKENS

    @classmethod
    def from_dict(cls, raw: Optional[dict]) -> "ProviderConfig | None":
        if not isinstance(raw, dict):
            return None
        api_key = (raw.get("api_key") or "").strip()
        if not api_key:
            return None
        provider = (raw.get("provider") or "openai").lower()
        # Reject unknown providers at the boundary so the WS path can fall
        # through to the stub cleanly. When we add Anthropic / DeepSeek /
        # OpenRouter, extend this allowlist.
        if provider not in {"openai"}:
            return None
        return cls(
            provider=provider,
            api_key=api_key,
            model=raw.get("model") or DEFAULT_MODEL,
            max_tokens=int(raw.get("max_tokens") or DEFAULT_MAX_TOKENS),
        )


@dataclass
class _Agent:
    name: str
    phase: str
    system_prompt: str


# Spirit-of-upstream prompts — short, focused, role-defining. Not copied from
# upstream verbatim. Each agent receives the same user-message context block
# (ticker / date / data summary / news / prior turns) and is asked to play one
# specific part of the debate.

_AGENTS: list[_Agent] = [
    _Agent(
        name="technical_analyst",
        phase="analysts",
        system_prompt=(
            "You are a senior technical analyst on a multi-agent trading research "
            "team. Read the provided price action and volume context, identify "
            "the most decision-relevant technical setup in 3-5 sentences. Focus "
            "on trend, momentum, support/resistance, and volume confirmation. "
            "No disclaimers. No greetings. Output is logged into a transcript."
        ),
    ),
    _Agent(
        name="fundamental_analyst",
        phase="analysts",
        system_prompt=(
            "You are a fundamental analyst. Given the ticker and any quoted "
            "price levels, comment briefly on what fundamentals would matter "
            "most right now (3-5 sentences). If you do not have detailed "
            "fundamentals data, say so explicitly and explain what you would "
            "look for."
        ),
    ),
    _Agent(
        name="news_analyst",
        phase="analysts",
        system_prompt=(
            "You are a news analyst. Read the provided headlines list. In 3-5 "
            "sentences, identify any catalysts that materially affect the "
            "ticker, distinguish noise from signal, and note what is missing "
            "from the available news that you would want to know."
        ),
    ),
    _Agent(
        name="sentiment_analyst",
        phase="analysts",
        system_prompt=(
            "You are a sentiment analyst. Comment in 3-5 sentences on what the "
            "tape and the headlines collectively imply about market sentiment "
            "for this ticker (positioning, conviction, retail vs institutional). "
            "Be specific about confidence."
        ),
    ),
    _Agent(
        name="bull_researcher",
        phase="researchers",
        system_prompt=(
            "You are the bull researcher. Make the strongest defensible long "
            "case in 3-5 sentences, anchored on the provided data. Do not "
            "hedge. Do not list. Argue."
        ),
    ),
    _Agent(
        name="bear_researcher",
        phase="researchers",
        system_prompt=(
            "You are the bear researcher. Make the strongest defensible short "
            "or avoid case in 3-5 sentences, anchored on the provided data. "
            "Do not hedge. Do not list. Argue."
        ),
    ),
    _Agent(
        name="research_manager",
        phase="researchers",
        system_prompt=(
            "You are the research manager. You have just heard a bull and bear "
            "case. In 3-5 sentences, weigh the asymmetry, decide which side "
            "carries the better risk-adjusted argument *for the next few "
            "trading sessions*, and state a directional lean."
        ),
    ),
    _Agent(
        name="trader",
        phase="trader",
        system_prompt=(
            "You are the trader. Given the analyst and researcher views, "
            "produce a concrete trade plan in 3-5 sentences: whether to enter, "
            "size posture (small / standard / sized up), and a defined-risk "
            "stop level if you would enter. If you would not enter, say HOLD "
            "and explain why."
        ),
    ),
    _Agent(
        name="risk_aggressive",
        phase="risk",
        system_prompt=(
            "You are the aggressive risk seat. Argue in 2-3 sentences for the "
            "more opportunistic course of action — what does the team risk by "
            "being too cautious here?"
        ),
    ),
    _Agent(
        name="risk_conservative",
        phase="risk",
        system_prompt=(
            "You are the conservative risk seat. Argue in 2-3 sentences for "
            "the more defensive course of action — what does the team risk by "
            "being too aggressive here?"
        ),
    ),
    _Agent(
        name="risk_neutral",
        phase="risk",
        system_prompt=(
            "You are the neutral risk seat. In 2-3 sentences, propose the "
            "lowest-regret course of action that respects both the aggressive "
            "and conservative arguments."
        ),
    ),
    _Agent(
        name="portfolio_manager",
        phase="risk",
        system_prompt=(
            "You are the portfolio manager. Make the final decision: BUY, "
            "SELL, or HOLD. Output exactly two lines:\n"
            "Line 1: one of: ACTION=BUY | ACTION=SELL | ACTION=HOLD\n"
            "Line 2: CONFIDENCE=<float between 0 and 1>\n"
            "Then 2-3 sentences of reasoning. Be decisive."
        ),
    ),
]

# Sanity check matches the explicit cap.
assert len(_AGENTS) == MAX_AGENTS_PER_SESSION, "agent count must match the cap"


@dataclass
class _DebateState:
    transcript: list[dict] = field(default_factory=list)  # {agent, content}
    input_tokens: int = 0
    output_tokens: int = 0


def _format_context(
    *,
    ticker: str,
    trade_date: str,
    summary: Optional[QuoteSummary],
    headlines: Optional[list[Headline]],
    state: _DebateState,
) -> str:
    """Build the user message for a given agent — same structure for all."""
    lines: list[str] = []
    lines.append(f"Ticker: {ticker}")
    lines.append(f"Trade date (anchor): {trade_date}")
    if summary is not None:
        lines.append("")
        lines.append("Recent price action (compact summary):")
        lines.append(f"- last close: {summary.last_close:.2f} (as of {summary.as_of})")
        lines.append(
            f"- {summary.sessions}-session window: "
            f"open {summary.period_open:.2f}, "
            f"high {summary.period_high:.2f}, "
            f"low {summary.period_low:.2f}, "
            f"change {summary.period_change_pct:+.2f}%"
        )
        lines.append(f"- avg daily volume: {int(summary.avg_volume):,}")
        lines.append(f"- source: {summary.source}")
    if headlines:
        lines.append("")
        lines.append("Recent news headlines:")
        for h in headlines[:6]:
            pub = f" ({h.publisher})" if h.publisher else ""
            lines.append(f"- {h.title}{pub}")
    if state.transcript:
        lines.append("")
        lines.append("Prior turns in this debate (most recent last):")
        for turn in state.transcript:
            lines.append(f"[{turn['agent']}] {turn['content']}")
    return "\n".join(lines)


def _estimate_cost(model: str, in_tokens: int, out_tokens: int) -> float:
    rates = _COST_PER_M_TOKENS.get(model, _COST_PER_M_TOKENS[DEFAULT_MODEL])
    return (in_tokens * rates["input"] + out_tokens * rates["output"]) / 1_000_000


def _parse_decision(content: str) -> dict:
    """Extract ACTION / CONFIDENCE from the portfolio_manager output.

    Tolerant of formatting drift — if the lines aren't found, falls back to
    HOLD / 0.5 with the raw content as reasoning.
    """
    import re

    action = "HOLD"
    confidence = 0.5
    m = re.search(r"ACTION\s*=\s*(BUY|SELL|HOLD)", content, re.IGNORECASE)
    if m:
        action = m.group(1).upper()
    m = re.search(r"CONFIDENCE\s*=\s*([0-9]*\.?[0-9]+)", content, re.IGNORECASE)
    if m:
        try:
            v = float(m.group(1))
            if 0 <= v <= 1:
                confidence = v
            elif 0 <= v <= 100:
                confidence = v / 100
        except ValueError:
            pass
    # Strip the directives from the reasoning so it reads naturally.
    reasoning = re.sub(
        r"^\s*(ACTION|CONFIDENCE)\s*=.*$",
        "",
        content,
        flags=re.IGNORECASE | re.MULTILINE,
    ).strip()
    if not reasoning:
        reasoning = content.strip()
    return {"action": action, "confidence": confidence, "reasoning": reasoning}


async def _call_openai(
    *,
    client,
    config: ProviderConfig,
    system: str,
    user: str,
) -> tuple[str, int, int]:
    """Single OpenAI chat call. Returns (content, in_tokens, out_tokens).

    The caller owns the AsyncOpenAI client lifecycle so we don't open and
    close a new httpx pool 12 times per session.
    """
    resp = await client.chat.completions.create(
        model=config.model,
        max_tokens=config.max_tokens,
        temperature=0.7,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    choice = resp.choices[0].message.content or ""
    usage = resp.usage
    in_tok = getattr(usage, "prompt_tokens", 0) if usage else 0
    out_tok = getattr(usage, "completion_tokens", 0) if usage else 0
    return choice.strip(), in_tok, out_tok


async def live_debate(
    *,
    ticker: str,
    trade_date: str,
    summary: Optional[QuoteSummary],
    headlines: Optional[list[Headline]],
    config: ProviderConfig,
) -> AsyncIterator[dict]:
    """Real-LLM debate. Yields the same event shapes as `canned_debate`.

    Caller is responsible for sending these events down the WebSocket and
    enforcing per-event delays — this generator does NOT include `_delay`
    fields because the LLM round trips already provide natural pacing.
    """
    # `from_dict` already rejects unknown providers, but defend in depth:
    # callers that build ProviderConfig manually shouldn't be able to bypass
    # the allowlist and crash the WS handler.
    if config.provider != "openai":
        # Surface as a session-level decision so the UI shows a useful state
        # and the WS still closes cleanly.
        yield {
            "type": "session.start",
            "ticker": ticker,
            "trade_date": trade_date,
        }
        yield {
            "type": "session.complete",
            "ticker": ticker,
            "trade_date": trade_date,
            "decision": {
                "action": "HOLD",
                "confidence": 0.0,
                "reasoning": (
                    f"Live debate aborted: provider {config.provider!r} is "
                    "not yet supported. Configure OpenAI in Settings, or "
                    "leave the LLM unconfigured to run the stub."
                ),
            },
            "live": False,
        }
        return

    from openai import AsyncOpenAI

    started_at = time.time()
    state = _DebateState()
    # Single client for the whole session — pooled connections, deterministic
    # teardown when the `async with` exits.
    client = AsyncOpenAI(api_key=config.api_key)

    yield {
        "type": "session.start",
        "ticker": ticker,
        "trade_date": trade_date,
    }

    last_phase: Optional[str] = None
    final_decision: Optional[dict] = None

    # Defensive cap: never exceed the agent count even if the table grows.
    for agent in _AGENTS[:MAX_AGENTS_PER_SESSION]:
        if last_phase is not None and agent.phase != last_phase:
            yield {"type": "phase.transition", "from": last_phase, "to": agent.phase}
        last_phase = agent.phase

        user_msg = _format_context(
            ticker=ticker,
            trade_date=trade_date,
            summary=summary,
            headlines=headlines,
            state=state,
        )
        try:
            content, in_tok, out_tok = await _call_openai(
                client=client,
                config=config,
                system=agent.system_prompt,
                user=user_msg,
            )
        except Exception as exc:  # noqa: BLE001 — convert any provider error into a stream event
            yield {
                "type": "agent.message",
                "agent": agent.name,
                "phase": agent.phase,
                "content": f"[live debate error] {type(exc).__name__}: {exc}",
            }
            # If the very first agent fails, abort early — no point continuing.
            if not state.transcript:
                final_decision = {
                    "action": "HOLD",
                    "confidence": 0.0,
                    "reasoning": (
                        f"Live debate aborted: {type(exc).__name__}. "
                        "Check the configured OpenAI key and model availability."
                    ),
                }
                break
            continue

        state.input_tokens += in_tok
        state.output_tokens += out_tok
        state.transcript.append({"agent": agent.name, "content": content})

        if agent.name == "portfolio_manager":
            final_decision = _parse_decision(content)

        yield {
            "type": "agent.message",
            "agent": agent.name,
            "phase": agent.phase,
            "content": content,
        }

    cost = _estimate_cost(config.model, state.input_tokens, state.output_tokens)
    duration = time.time() - started_at
    sys.stderr.write(
        f"[live_debate] ticker={ticker} model={config.model} "
        f"in_tokens={state.input_tokens} out_tokens={state.output_tokens} "
        f"est_cost_usd={cost:.4f} duration_s={duration:.1f}\n"
    )
    sys.stderr.flush()

    # Best-effort client cleanup. AsyncOpenAI's __aexit__ closes the pooled
    # httpx client; doing it explicitly avoids "unclosed transport" warnings
    # in Python 3.12+ when the event loop tears down.
    try:
        await client.close()
    except Exception:  # noqa: BLE001 — cleanup is best-effort
        pass

    if final_decision is None:
        final_decision = {
            "action": "HOLD",
            "confidence": 0.5,
            "reasoning": (
                "Live debate finished without an explicit portfolio decision. "
                "Defaulting to HOLD."
            ),
        }

    yield {
        "type": "session.complete",
        "ticker": ticker,
        "trade_date": trade_date,
        "decision": final_decision,
        "live": True,
        "model": config.model,
        "input_tokens": state.input_tokens,
        "output_tokens": state.output_tokens,
        "estimated_cost_usd": round(cost, 4),
    }
