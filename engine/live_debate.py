"""Phase 2.1-light: real-LLM debate with sequential per-agent calls.

This is intentionally *not* a wrapper around upstream's LangGraph. We pull the
spirit of the upstream agent roles (their system prompts, their phase
structure) but call the model directly with our own minimal orchestration.
The full upstream-graph integration is a later phase; the simpler approach is
controllable, debuggable, and stays under the founder's quota.

Cost discipline (non-negotiable, enforced HERE not in adapters):
- Total agents per session is bounded by `MAX_AGENTS_PER_SESSION = 12`
- `max_tokens` per agent message is capped to whatever `ProviderConfig` carries
  (which is itself capped by `_MAX_TOKENS_HARD_CAP` in `llm_providers.py`)
- Estimated cost per session is logged to stderr after `session.complete`

Rough budget per session at defaults (gpt-4o-mini, 400 tokens): ~7,400 input
tokens (each agent gets the prior turns appended) + ~2,400 output tokens
≈ ~$0.005 USD. Other providers in `llm_providers._COST_PER_M_TOKENS`.

When a provider key is not configured, the module is not invoked at all —
the WS path falls back to the canned `stub_debate.canned_debate` instead.
Multi-provider support: see `llm_providers.LLMAdapter` for the Protocol +
implementations (OpenAI, Anthropic, OpenRouter, Gemini).
"""

from __future__ import annotations

import sys
import time
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional

from .data_providers import Headline, QuoteSummary
from .llm_providers import (
    LLMAdapter,
    ProviderConfig,
    adapter_for,
    estimate_cost,
)


# ---- Cost / quota guardrails -------------------------------------------------

MAX_AGENTS_PER_SESSION = 12  # same as the canned debate count

# Backwards-compat re-exports — keep callers importing from live_debate working.
__all__ = ["live_debate", "ProviderConfig", "MAX_AGENTS_PER_SESSION"]


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
    # `ProviderConfig.from_dict` rejects unknown providers; `adapter_for` is
    # the second guard. If neither catches a misconfiguration, surface a
    # graceful session.complete instead of crashing the WS handler.
    try:
        adapter: LLMAdapter = adapter_for(config)
    except ValueError as exc:
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
                    f"Live debate aborted: {exc}. Configure a supported "
                    "provider in Settings, or leave the LLM unconfigured "
                    "to run the stub."
                ),
            },
            "live": False,
        }
        return

    started_at = time.time()
    state = _DebateState()
    # `bearer_token` works for both api_key and oauth auth shapes; the
    # adapter's `api_key` kwarg is named for Protocol consistency but
    # accepts any Bearer token. For OpenAI's standard chat-completions
    # endpoint both `sk-…` and OAuth tokens go in the same Authorization
    # header. For the Codex backend (OAuth path) the same header carries
    # the access token, AND a separate `chatgpt-account-id` header is
    # required — passed via the adapter's `set_account_id` if it has one.
    await adapter.open(api_key=config.bearer_token)
    if config.auth.get("type") == "oauth":
        account_id = config.auth.get("account_id")
        if account_id and hasattr(adapter, "set_account_id"):
            adapter.set_account_id(str(account_id))

    # try/finally guarantees adapter cleanup even when the client disconnects
    # mid-stream (FastAPI raises WebSocketDisconnect, which throws GeneratorExit
    # into this generator). Without this, the adapter's pooled httpx client
    # leaks for the lifetime of the engine process.
    yielded_complete = False
    try:
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
                content, in_tok, out_tok = await adapter.complete(
                    system=agent.system_prompt,
                    user=user_msg,
                    model=config.model,
                    max_tokens=config.max_tokens,
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
                            f"Check the configured {config.provider} key and model availability."
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

        cost = estimate_cost(config.model, state.input_tokens, state.output_tokens)
        duration = time.time() - started_at
        sys.stderr.write(
            f"[live_debate] provider={config.provider} auth={config.auth_kind} "
            f"ticker={ticker} model={config.model} "
            f"in_tokens={state.input_tokens} out_tokens={state.output_tokens} "
            f"est_cost_usd={cost:.4f} duration_s={duration:.1f}\n"
        )
        sys.stderr.flush()

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
            "provider": config.provider,
            "model": config.model,
            "input_tokens": state.input_tokens,
            "output_tokens": state.output_tokens,
            "estimated_cost_usd": round(cost, 4),
        }
        yielded_complete = True
    finally:
        # Best-effort adapter cleanup. Runs on normal exit AND on
        # GeneratorExit (client disconnect mid-stream) — without this the
        # pooled httpx client inside Anthropic / OpenAI adapters leaks for
        # the engine process lifetime.
        try:
            await adapter.close()
        except Exception:  # noqa: BLE001 — cleanup is best-effort
            pass
        if not yielded_complete:
            sys.stderr.write(
                f"[live_debate] disconnected mid-stream provider={config.provider} "
                f"ticker={ticker} agents_completed={len(state.transcript)}\n"
            )
            sys.stderr.flush()
