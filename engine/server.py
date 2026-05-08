"""FastAPI application factory + route definitions.

Phase 2 endpoints:
- GET  /health         — sanity ping
- POST /analyze        — one-shot analysis (stub)
- WS   /stream         — streaming agent debate (canned sequence)

Auth: all endpoints require `Authorization: Bearer <token>` header (or
`?token=...` query param on WebSocket since browsers can't set headers there).
"""

from __future__ import annotations

import asyncio
import time
from typing import Annotated, Any

from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import __version__
from .data_providers import (
    DataUnavailable,
    Headline,
    QuoteSummary,
    default_provider,
)
from .stub_debate import canned_debate


def build_app(*, token: str) -> FastAPI:
    started_at = time.monotonic()

    app = FastAPI(
        title="TradingAgentsLab Engine",
        version=__version__,
        docs_url=None,        # Disable Swagger — sidecar is private
        redoc_url=None,
        openapi_url=None,
    )

    # Renderer runs on http://localhost:5173 in dev (Vite). Sidecar binds to
    # 127.0.0.1 only, so this isn't a security boundary — it's just the browser
    # CORS preflight requirement for cross-origin fetches. WebSocket /stream is
    # unaffected by CORS but harmless to allow.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    def require_bearer(authorization: Annotated[str | None, Header()] = None) -> None:
        if authorization is None or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="missing bearer token",
            )
        if authorization.removeprefix("Bearer ") != token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid token",
            )

    bearer = [Depends(require_bearer)]

    @app.get("/health", dependencies=bearer)
    async def health() -> dict[str, Any]:
        return {
            "ok": True,
            "version": __version__,
            "uptime_seconds": round(time.monotonic() - started_at, 2),
            "engine_state": "stub",
            "data_provider": default_provider.name,
        }

    @app.get("/data/summary", dependencies=bearer)
    async def data_summary(ticker: str, trade_date: str) -> dict[str, Any]:
        try:
            summary = await default_provider.quote_summary(
                ticker=ticker, trade_date=trade_date
            )
        except DataUnavailable as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            )
        except Exception as exc:  # noqa: BLE001 — convert any provider error into 502
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"data provider error: {exc}",
            )
        return _summary_to_dict(summary)

    @app.get("/data/news", dependencies=bearer)
    async def data_news(ticker: str, limit: int = 5) -> dict[str, Any]:
        try:
            headlines = await default_provider.news_headlines(
                ticker=ticker, limit=max(1, min(limit, 20))
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"news provider error: {exc}",
            )
        return {
            "ticker": ticker.upper(),
            "source": default_provider.name,
            "headlines": [_headline_to_dict(h) for h in headlines],
        }

    @app.post("/analyze", dependencies=bearer)
    async def analyze(req: AnalyzeRequest) -> dict[str, Any]:
        # Phase 2 stub — Phase 3+ wires this to the real tradingagents core.
        return {
            "ok": True,
            "ticker": req.ticker.upper(),
            "trade_date": req.trade_date,
            "decision": {
                "action": "HOLD",
                "confidence": 0.5,
                "reasoning": (
                    "Stub response — engine not yet connected to tradingagents core."
                ),
            },
            "agents": [],
        }

    @app.websocket("/stream")
    async def stream(ws: WebSocket) -> None:
        # WS auth via query param (browsers cannot set Authorization headers on WS).
        provided = ws.query_params.get("token")
        if provided != token:
            await ws.close(code=1008, reason="invalid token")
            return
        await ws.accept()

        try:
            # Wait for the client's start frame: {"ticker": "...", "trade_date": "..."}
            start = await ws.receive_json()
            ticker = (start.get("ticker") or "").upper()
            trade_date = start.get("trade_date") or ""

            # Best-effort data fetch; debate degrades gracefully if it fails.
            summary = await _fetch_summary_safe(ticker=ticker, trade_date=trade_date)
            if summary is not None:
                await ws.send_json(
                    {"type": "data.summary", **_summary_to_dict(summary)}
                )

            headlines = await _fetch_news_safe(ticker=ticker, limit=4)
            if headlines:
                await ws.send_json({
                    "type": "news.headlines",
                    "ticker": ticker,
                    "source": default_provider.name,
                    "headlines": [_headline_to_dict(h) for h in headlines],
                })

            for event in canned_debate(
                ticker=ticker,
                trade_date=trade_date,
                summary=summary,
                headlines=headlines,
            ):
                await ws.send_json(event)
                await asyncio.sleep(event.pop("_delay", 0.4))
            await ws.close(code=1000)
        except WebSocketDisconnect:
            return

    return app


async def _fetch_summary_safe(*, ticker: str, trade_date: str) -> QuoteSummary | None:
    if not ticker or not trade_date:
        return None
    try:
        return await default_provider.quote_summary(
            ticker=ticker, trade_date=trade_date
        )
    except Exception:  # noqa: BLE001 — never let data issues break the stream
        return None


async def _fetch_news_safe(*, ticker: str, limit: int) -> list[Headline]:
    if not ticker:
        return []
    try:
        return await default_provider.news_headlines(ticker=ticker, limit=limit)
    except Exception:  # noqa: BLE001
        return []


def _headline_to_dict(h: Headline) -> dict[str, Any]:
    return {
        "title": h.title,
        "publisher": h.publisher,
        "pub_date": h.pub_date,
        "url": h.url,
        "summary": h.summary,
    }


def _summary_to_dict(summary: QuoteSummary) -> dict[str, Any]:
    return {
        "ticker": summary.ticker,
        "trade_date": summary.trade_date,
        "as_of": summary.as_of,
        "last_close": summary.last_close,
        "period_open": summary.period_open,
        "period_high": summary.period_high,
        "period_low": summary.period_low,
        "period_change_pct": summary.period_change_pct,
        "avg_volume": summary.avg_volume,
        "sessions": summary.sessions,
        "source": summary.source,
    }


class AnalyzeRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=8)
    trade_date: str = Field(min_length=8, max_length=10, description="YYYY-MM-DD")
