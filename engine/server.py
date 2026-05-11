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
import sys
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
    BaseDataProvider,
    DataUnavailable,
    Headline,
    QuoteSummary,
    default_provider,
    provider_from_data_config,
)
from .live_debate import ProviderConfig, live_debate
from . import cost_guard, storage
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
        allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
        from .llm_providers import _ALLOWED_PROVIDERS, _DEFAULT_MODELS

        return {
            "ok": True,
            "version": __version__,
            "uptime_seconds": round(time.monotonic() - started_at, 2),
            # "engine_state" describes the *capability* of the engine. The
            # WS path uses the canned stub when no provider_config arrives in
            # the start frame, and the live path otherwise — so the engine
            # itself reports "ready" rather than "stub" or "live".
            "engine_state": "ready",
            "data_provider": default_provider.name,
            "live_supported": True,
            # Per-provider default models the engine assumes when ProviderConfig
            # arrives without an explicit `model` field. Renderer should also
            # ship its own defaults (PROVIDER_DEFAULT_MODEL); these are the
            # source of truth.
            "live_providers": sorted(_ALLOWED_PROVIDERS),
            "live_default_models": dict(_DEFAULT_MODELS),
            "storage_path": storage.db_path(),
        }

    @app.get("/providers/ollama/health", dependencies=bearer)
    async def ollama_health_endpoint(base_url: str = "") -> dict[str, Any]:
        """Probe a local Ollama daemon. Used by the settings UI to confirm
        connectivity and populate the model dropdown with what the user has
        actually `ollama pull`'d. Never raises — failure modes return
        `{"ok": False, "error": "..."}`.
        """
        from .llm_providers import ollama_health

        return await ollama_health(base_url)

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

    @app.get("/sessions", dependencies=bearer)
    async def list_sessions_endpoint(
        limit: int = 50, ticker: str | None = None
    ) -> dict[str, Any]:
        rows = storage.list_sessions(limit=limit, ticker=ticker)
        return {"sessions": [storage.summary_to_dict(r) for r in rows]}

    @app.get("/sessions/{session_id}", dependencies=bearer)
    async def get_session_endpoint(session_id: str) -> dict[str, Any]:
        detail = storage.get_session(session_id)
        if detail is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"session {session_id!r} not found",
            )
        return storage.detail_to_dict(detail)

    @app.delete("/sessions/{session_id}", dependencies=bearer)
    async def delete_session_endpoint(session_id: str) -> dict[str, Any]:
        deleted = storage.delete_session(session_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"session {session_id!r} not found",
            )
        return {"deleted": True, "id": session_id}

    @app.get("/watchlist", dependencies=bearer)
    async def list_watchlist_endpoint() -> dict[str, Any]:
        rows = storage.list_watchlist()
        return {"watchlist": [storage.watchlist_to_dict(r) for r in rows]}

    @app.post("/watchlist", dependencies=bearer)
    async def add_watchlist_endpoint(req: WatchlistAddRequest) -> dict[str, Any]:
        try:
            entry = storage.add_watchlist(ticker=req.ticker, note=req.note)
        except storage.WatchlistConflict as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(exc),
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            )
        return storage.watchlist_to_dict(entry)

    @app.delete("/watchlist/{ticker}", dependencies=bearer)
    async def remove_watchlist_endpoint(ticker: str) -> dict[str, Any]:
        removed = storage.remove_watchlist(ticker)
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{ticker.upper()!r} not on the watchlist",
            )
        return {"removed": True, "ticker": ticker.upper()}

    @app.get("/cost-guard/state", dependencies=bearer)
    async def cost_guard_state() -> dict[str, Any]:
        spend, config = cost_guard.get_state()
        return {
            "spend": cost_guard.spend_to_dict(spend),
            "config": cost_guard.config_to_dict(config),
        }

    @app.put("/cost-guard/config", dependencies=bearer)
    async def cost_guard_update(req: CostGuardConfigRequest) -> dict[str, Any]:
        new_config = cost_guard.update_config(
            enabled=req.enabled,
            cap_daily_usd=req.cap_daily_usd,
            cap_weekly_usd=req.cap_weekly_usd,
            cap_monthly_usd=req.cap_monthly_usd,
            cap_sessions_per_day=req.cap_sessions_per_day,
        )
        return cost_guard.config_to_dict(new_config)

    @app.post("/cost-guard/check", dependencies=bearer)
    async def cost_guard_check(req: CostGuardCheckRequest) -> dict[str, Any]:
        result = cost_guard.check(
            model=req.model,
            auth_kind=req.auth_kind,
            max_tokens=req.max_tokens,
        )
        return cost_guard.check_result_to_dict(result)

    @app.post("/cost-guard/reserve", dependencies=bearer)
    async def cost_guard_reserve(req: CostGuardReserveRequest) -> dict[str, Any]:
        try:
            result = cost_guard.reserve(
                model=req.model,
                auth_kind=req.auth_kind,
                max_tokens=req.max_tokens,
                override=req.override,
            )
        except cost_guard.CostGuardBlocked as exc:
            # 402 Payment Required — semantic match for "you can't afford
            # this without overriding"; pair with a JSON body the renderer
            # uses to populate the override modal.
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "cost_guard_blocked",
                    "over_dimension": exc.over_dimension,
                    "spend": cost_guard.spend_to_dict(exc.spend),
                    "config": cost_guard.config_to_dict(exc.config),
                    "est_cost_usd": round(exc.est_cost, 6),
                },
            )
        return cost_guard.reserve_result_to_dict(result)

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

        captured_events: list[dict] = []
        try:
            # Wait for the client's start frame:
            #   {
            #     "ticker": "NVDA",
            #     "trade_date": "2026-05-08",
            #     "provider_config": {                  # optional
            #       "provider": "openai",
            #       "api_key": "sk-...",
            #       "model": "gpt-4o-mini",
            #       "max_tokens": 400
            #     }
            #   }
            start = await ws.receive_json()
            ticker = (start.get("ticker") or "").upper()
            trade_date = start.get("trade_date") or ""
            config = ProviderConfig.from_dict(start.get("provider_config"))
            # Optional. Set by Analyze.tsx after a renderer-side cost-guard
            # check. If absent on a live debate, the WS handler auto-reserves
            # below for backward compatibility.
            reservation_id = start.get("reservation_id") or None
            # Optional. When the renderer has Alpaca data keys configured,
            # it sends them as data_config = {provider: "alpaca", key_id, secret}.
            # Engine instantiates a per-stream AlpacaProvider; otherwise falls
            # through to the module-level yfinance default. No fallback chain
            # on Alpaca failure — if user configured Alpaca and it errors, the
            # data card stays empty so they notice (silent fall-through to
            # yfinance would mask configuration issues).
            data_provider: BaseDataProvider = (
                provider_from_data_config(start.get("data_config")) or default_provider
            )
            llm_label = (
                f"{config.provider}/{config.auth_kind}/{config.model}"
                if config is not None
                else "stub"
            )
            sys.stderr.write(
                f"[ws] OPEN ticker={ticker} date={trade_date} "
                f"data={data_provider.name} llm={llm_label}\n"
            )

            # Best-effort data fetch; debate degrades gracefully if it fails.
            summary = await _fetch_summary_safe(
                ticker=ticker, trade_date=trade_date, provider=data_provider
            )
            if summary is not None:
                evt = {"type": "data.summary", **_summary_to_dict(summary)}
                await ws.send_json(evt)
                captured_events.append(evt)

            headlines = await _fetch_news_safe(
                ticker=ticker, limit=4, provider=data_provider
            )
            if headlines:
                evt = {
                    "type": "news.headlines",
                    "ticker": ticker,
                    "source": data_provider.name,
                    "headlines": [_headline_to_dict(h) for h in headlines],
                }
                await ws.send_json(evt)
                captured_events.append(evt)

            if config is not None:
                # CostGuard auto-reserve when the renderer didn't pre-reserve.
                # Older renderer versions don't send reservation_id; rather
                # than reject them, we reserve server-side with override=False.
                # If the cap is exceeded, we send a structured error event
                # and close — renderer can surface this as a "configure caps
                # in Settings" hint.
                if not reservation_id:
                    try:
                        auto = cost_guard.reserve(
                            model=config.model,
                            auth_kind=config.auth_kind,
                            max_tokens=config.max_tokens,
                            override=False,
                        )
                        reservation_id = auto.reservation_id
                    except cost_guard.CostGuardBlocked as exc:
                        evt = {
                            "type": "cost.blocked",
                            "over_dimension": exc.over_dimension,
                            "spend": cost_guard.spend_to_dict(exc.spend),
                            "config": cost_guard.config_to_dict(exc.config),
                            "est_cost_usd": round(exc.est_cost, 6),
                            "message": (
                                f"Live debate blocked: would exceed {exc.over_dimension} "
                                f"cap. Configure higher caps in Settings or use override."
                            ),
                        }
                        await ws.send_json(evt)
                        captured_events.append(evt)
                        await ws.close(code=1008, reason="cost_guard_blocked")
                        return
                # Live debate path. Each agent.message arrives as the LLM
                # response completes — we throttle a little between events
                # so the UI's transition animations are still visible.
                async for event in live_debate(
                    ticker=ticker,
                    trade_date=trade_date,
                    summary=summary,
                    headlines=headlines,
                    config=config,
                    reservation_id=reservation_id,
                ):
                    await ws.send_json(event)
                    captured_events.append(event)
                    await asyncio.sleep(0.15)
            else:
                # Stub debate path — same UX, deterministic content.
                for event in canned_debate(
                    ticker=ticker,
                    trade_date=trade_date,
                    summary=summary,
                    headlines=headlines,
                ):
                    delay = event.pop("_delay", 0.4)
                    await ws.send_json(event)
                    captured_events.append(event)
                    await asyncio.sleep(delay)

            # Persist the completed session — best-effort, never fails the
            # stream. The user already saw the debate; persistence is bonus.
            _persist_session_safe(
                ticker=ticker,
                trade_date=trade_date,
                events=captured_events,
            )

            sys.stderr.write(
                f"[ws] CLOSE ticker={ticker} events={len(captured_events)} code=1000\n"
            )
            await ws.close(code=1000)
        except WebSocketDisconnect:
            sys.stderr.write(f"[ws] DISCONNECT ticker={ticker} mid-stream\n")
            return

    return app


def _persist_session_safe(
    *, ticker: str, trade_date: str, events: list[dict]
) -> None:
    """Find session.complete in the captured events and write a row."""
    if not events:
        return
    complete: dict | None = None
    for ev in events:
        if isinstance(ev, dict) and ev.get("type") == "session.complete":
            complete = ev
            break
    if complete is None:
        # Stream was aborted (Stop button) — don't persist a partial session.
        return
    raw_decision = complete.get("decision")
    decision = raw_decision if isinstance(raw_decision, dict) else {
        "action": "HOLD",
        "confidence": 0.0,
        "reasoning": "Session ended without a well-formed decision payload.",
    }
    storage.write_session(
        ticker=ticker,
        trade_date=trade_date,
        events=events,
        decision=decision,
        live=bool(complete.get("live", False)),
        provider=complete.get("provider"),
        model=complete.get("model"),
        input_tokens=complete.get("input_tokens"),
        output_tokens=complete.get("output_tokens"),
        estimated_cost_usd=complete.get("estimated_cost_usd"),
        auth_kind=complete.get("auth_kind"),
    )


async def _fetch_summary_safe(
    *,
    ticker: str,
    trade_date: str,
    provider: BaseDataProvider | None = None,
) -> QuoteSummary | None:
    if not ticker or not trade_date:
        return None
    p = provider or default_provider
    try:
        return await p.quote_summary(ticker=ticker, trade_date=trade_date)
    except Exception:  # noqa: BLE001 — never let data issues break the stream
        return None


async def _fetch_news_safe(
    *,
    ticker: str,
    limit: int,
    provider: BaseDataProvider | None = None,
) -> list[Headline]:
    if not ticker:
        return []
    p = provider or default_provider
    try:
        return await p.news_headlines(ticker=ticker, limit=limit)
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
        "asset_class": summary.asset_class,
    }


class AnalyzeRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=8)
    trade_date: str = Field(min_length=8, max_length=10, description="YYYY-MM-DD")


class WatchlistAddRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=8)
    note: str | None = Field(default=None, max_length=200)


class CostGuardConfigRequest(BaseModel):
    """All fields optional — only provided fields are updated (PATCH semantics
    on a PUT for simplicity)."""

    enabled: bool | None = None
    cap_daily_usd: float | None = Field(default=None, ge=0)
    cap_weekly_usd: float | None = Field(default=None, ge=0)
    cap_monthly_usd: float | None = Field(default=None, ge=0)
    cap_sessions_per_day: int | None = Field(default=None, ge=0)


class CostGuardCheckRequest(BaseModel):
    model: str = Field(min_length=1, max_length=120)
    auth_kind: str = Field(pattern=r"^(api_key|oauth)$")
    max_tokens: int = Field(default=400, ge=1, le=8000)


class CostGuardReserveRequest(CostGuardCheckRequest):
    override: bool = False
