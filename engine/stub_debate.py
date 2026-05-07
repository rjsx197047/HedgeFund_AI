"""Canned multi-agent debate sequence for Phase 2.

Mirrors the shape of events the real tradingagents pipeline will emit:
session.start → analysts → researchers → trader → risk → session.complete.

Each event includes a `_delay` field (popped before send) controlling how long
to wait before sending the NEXT event — enough for the UI to feel "live"
without dragging.
"""

from __future__ import annotations

from typing import Iterator


def canned_debate(*, ticker: str, trade_date: str) -> Iterator[dict]:
    yield {
        "type": "session.start",
        "ticker": ticker,
        "trade_date": trade_date,
        "_delay": 0.5,
    }

    yield {
        "type": "agent.message",
        "agent": "technical_analyst",
        "phase": "analysts",
        "content": (
            f"[STUB] Technical setup on {ticker}: price action consolidating "
            f"in a tightening range over the past 10 sessions. RSI neutral at 52, "
            f"MACD histogram flattening. No decisive breakout signal."
        ),
        "_delay": 0.6,
    }

    yield {
        "type": "agent.message",
        "agent": "fundamental_analyst",
        "phase": "analysts",
        "content": (
            f"[STUB] Fundamentals review for {ticker}: revenue growth steady, "
            f"margin profile intact. Forward P/E in line with sector median. "
            f"No material balance sheet changes since last earnings."
        ),
        "_delay": 0.6,
    }

    yield {
        "type": "agent.message",
        "agent": "news_analyst",
        "phase": "analysts",
        "content": (
            f"[STUB] News scan around {trade_date}: no company-specific catalysts. "
            f"Sector-level headlines neutral. Macro backdrop steady."
        ),
        "_delay": 0.6,
    }

    yield {
        "type": "agent.message",
        "agent": "sentiment_analyst",
        "phase": "analysts",
        "content": (
            f"[STUB] Social/retail sentiment on {ticker}: marginally positive but "
            f"low conviction. Mention volume below 30-day average."
        ),
        "_delay": 0.5,
    }

    yield {
        "type": "phase.transition",
        "from": "analysts",
        "to": "researchers",
        "_delay": 0.3,
    }

    yield {
        "type": "agent.message",
        "agent": "bull_researcher",
        "phase": "researchers",
        "content": (
            f"[STUB] Bull case: consolidation absorbs supply ahead of next leg up. "
            f"Fundamentals support a re-rating if sector rotation favors growth."
        ),
        "_delay": 0.6,
    }

    yield {
        "type": "agent.message",
        "agent": "bear_researcher",
        "phase": "researchers",
        "content": (
            f"[STUB] Bear case: lack of catalyst risks further chop. Valuation "
            f"already pricing in the steady-state. Drawdown risk if sentiment turns."
        ),
        "_delay": 0.6,
    }

    yield {
        "type": "agent.message",
        "agent": "research_manager",
        "phase": "researchers",
        "content": (
            f"[STUB] Research judgment: insufficient asymmetry to favor either side. "
            f"Recommend HOLD with re-evaluation on next earnings or technical break."
        ),
        "_delay": 0.5,
    }

    yield {
        "type": "phase.transition",
        "from": "researchers",
        "to": "trader",
        "_delay": 0.3,
    }

    yield {
        "type": "agent.message",
        "agent": "trader",
        "phase": "trader",
        "content": (
            f"[STUB] Trade plan for {ticker}: HOLD existing exposure, no new entry. "
            f"If forced to act, prefer a small starter with defined stop below the "
            f"consolidation low."
        ),
        "_delay": 0.5,
    }

    yield {
        "type": "phase.transition",
        "from": "trader",
        "to": "risk",
        "_delay": 0.3,
    }

    yield {
        "type": "agent.message",
        "agent": "risk_aggressive",
        "phase": "risk",
        "content": "[STUB] Aggressive view: take the small starter — opportunity cost matters.",
        "_delay": 0.4,
    }

    yield {
        "type": "agent.message",
        "agent": "risk_conservative",
        "phase": "risk",
        "content": "[STUB] Conservative view: HOLD until a clean signal emerges.",
        "_delay": 0.4,
    }

    yield {
        "type": "agent.message",
        "agent": "risk_neutral",
        "phase": "risk",
        "content": "[STUB] Neutral view: HOLD is the lowest-regret move at this read.",
        "_delay": 0.4,
    }

    yield {
        "type": "agent.message",
        "agent": "portfolio_manager",
        "phase": "risk",
        "content": (
            f"[STUB] Portfolio decision on {ticker}: HOLD. Final."
        ),
        "_delay": 0.5,
    }

    yield {
        "type": "session.complete",
        "ticker": ticker,
        "trade_date": trade_date,
        "decision": {
            "action": "HOLD",
            "confidence": 0.55,
            "reasoning": "Stub canned debate — replaced in Phase 3+ by real agents.",
        },
        "_delay": 0,
    }
