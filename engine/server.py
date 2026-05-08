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

            for event in canned_debate(ticker=ticker, trade_date=trade_date):
                await ws.send_json(event)
                await asyncio.sleep(event.pop("_delay", 0.4))
            await ws.close(code=1000)
        except WebSocketDisconnect:
            return

    return app


class AnalyzeRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=8)
    trade_date: str = Field(min_length=8, max_length=10, description="YYYY-MM-DD")
