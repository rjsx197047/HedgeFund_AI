# TradingAgentsLab — Architecture

> **Status:** v0.2 — ratified 2026-05-07; updated 2026-05-08 to reflect Phase 2.1-light decision and Phase 4 secret-storage shape.
> **Companion docs:** [`backlog.md`](../backlog.md) — phased work items · [`Handover.md`](../Handover.md) — session-to-session context · [`api.md`](api.md) — engine API contract · [`CLAUDE.md`](../CLAUDE.md) — orchestration rules.

## 1. Project posture

TradingAgentsLab is an **AGPL-3.0 fork** of Tauric Research's TradingAgents (multi-agent LLM trading framework), positioned as the **"standalone trading companion for Clawless"** — independent product with ecosystem affinity.

**Connection, not integration.** Founder framing (2026-05-07): TradingAgentsLab connects to Clawless the same way it connects to Alpaca or Yahoo Finance — one of N optional connectors, configured in Settings, fully optional. **No Clawless code inheritance.** No shared CSS variables, no copied components, no AGPL-license-compatibility question. Brand-level coherence (compatible dark palette + fonts) achieved through independent design, not code reuse.

**Marketing posture (locked):** open-source educational lab + paper trading. Never recommend real-money trading. Sidesteps SEC investment-advisor scrutiny.

**Locked phrasing:**
- ✅ "Standalone trading companion for Clawless"
- ❌ NOT "Clawless extension / plugin / add-on / integration"

## 2. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Desktop shell | **Electron** | Matches Clawless. Lets us inherit settings page, theme tokens, and component code directly. |
| Renderer | **React + TypeScript** | Mirrors Clawless renderer stack. |
| Engine | **Python 3.13 sidecar** | TradingAgents core is Python; keep it native. The engine implements its own minimal multi-agent orchestration (Phase 2.1-light, see §5); a future phase may swap in upstream's `tradingagents.graph.TradingAgentsGraph` directly. |
| IPC | **FastAPI on `127.0.0.1`** (HTTP + WebSocket) | Streaming agent debate over WS; one-shot calls over HTTP. |
| LLM provider | **Two-mode abstraction** | (1) BYO keys default, (2) optional Clawless gateway tap. Same interface, two transports. |
| Data | **yfinance default + Alpaca optional** | yfinance keeps public free; Alpaca for power users (founder). Massive.com / Polygon-class deferred. |
| Broker | **Alpaca paper trading** (default), live trading gated | Aligns with educational posture. |
| Storage | **SQLite** (better-sqlite3 in Electron, sqlite3 in Python) | Mirrors Clawless. |
| Secrets | **Electron `safeStorage`** (OS keychain on macOS, DPAPI on Windows, libsecret on Linux). | No native dep, hard-fails if no encryption backend is available. Versioned JSON at `<userData>/secrets.json` — only base64-encoded encrypted blobs. |

## 3. Repository layout (target)

```
TradingAgentsLab/
├── tradingagents/                  # upstream Python core (Apache 2.0, preserved)
├── tools/clawless-probe.mjs        # gateway connectivity validator
├── desktop/                        # NEW: Electron app (AGPL-3.0)
│   ├── src/main/                   # Electron main process
│   │   ├── index.ts                # window mgmt, lifecycle
│   │   ├── engine-runner.ts        # spawn/manage Python sidecar
│   │   ├── engine-client.ts        # WS client → sidecar
│   │   └── clawless-client.ts      # OpenClaw gateway adapter (optional tap)
│   ├── src/renderer/               # React UI
│   │   ├── pages/
│   │   │   ├── Analyze.tsx         # ticker + date → live agent debate
│   │   │   ├── History.tsx         # past decisions, P&L
│   │   │   ├── Watchlist.tsx
│   │   │   └── Settings/           # inherit from Clawless
│   │   │       ├── LLMProviders.tsx   # BYO + OAuth (OpenAI), API-only (Anthropic)
│   │   │       ├── DataProviders.tsx  # yfinance / Alpaca
│   │   │       ├── Broker.tsx         # Alpaca paper / live (gated)
│   │   │       └── ClawlessTap.tsx    # optional gateway URL+token
│   │   └── theme/                  # inherit Clawless tokens
│   └── src/shared/                 # types used in main + renderer
├── engine/                         # NEW: Python FastAPI sidecar
│   ├── server.py                   # /analyze, /stream
│   ├── llm_providers/
│   │   ├── byo.py                  # OpenAI/Anthropic/Gemini/etc.
│   │   └── clawless_gateway.py     # OpenClaw RPC adapter
│   ├── data_providers/
│   │   ├── yfinance_adapter.py
│   │   └── alpaca_adapter.py
│   ├── brokers/
│   │   └── alpaca_broker.py
│   └── ipc.py                      # token + handshake with desktop
├── docs/architecture.md            # this file
├── backlog.md
├── Handover.md
├── CLAUDE.md                       # orchestration rules (pending template)
└── (LICENSE, LICENSE-APACHE, NOTICE, CLA.md, CONTRIBUTING.md, README.md)
```

## 4. Process / IPC topology

```
                     ┌──────────────────────────────────────────────────┐
                     │                  Electron Main                   │
                     │  • window mgmt   • OS keychain   • IPC broker    │
                     │  • spawns Python sidecar on app start            │
                     └───────────────┬─────────────────┬────────────────┘
                                     │                 │
                            spawn + WS              spawn?            (optional)
                                     │                 │                  │
                              ┌──────▼─────┐    ┌──────▼──────┐    ┌─────▼──────┐
                              │  Renderer  │    │   Python    │    │  Clawless  │
                              │   (React)  │ ◀─▶│   Sidecar   │ ─▶ │   Gateway  │
                              │            │ WS │  FastAPI    │    │ ws://...   │
                              └────────────┘    │ +trading-   │    │  :18789    │
                                                │  agents     │    └────────────┘
                                                └─────────────┘     (Pattern 3:
                                                                     optional tap)
```

- **Renderer ↔ Main:** standard Electron `ipcRenderer`/`ipcMain` for secrets, file access, window control
- **Renderer ↔ Sidecar:** WebSocket directly to `ws://127.0.0.1:<dyn-port>/stream` for live agent debate; HTTP for one-shots
- **Main ↔ Sidecar:** spawn lifecycle + handshake. Sidecar prints `{port, token}` JSON to stdout on startup; main reads, hands token to renderer for in-process calls.
- **Sidecar ↔ Clawless gateway** (optional): when "Connect to Clawless" enabled, the sidecar's LLM provider routes calls through `ws://127.0.0.1:18789` (validated via `tools/clawless-probe.mjs`). Otherwise BYO direct.

## 5. LLM provider abstraction

**Phase 2.1 decision (2026-05-08): minimal own-prompts impl, full upstream-graph integration deferred.**

The original sketch assumed the engine would wrap upstream's `tradingagents.graph.TradingAgentsGraph` directly. In practice that path requires bringing in the full LangChain / LangGraph dep tree, mapping LangGraph state-graph events onto our streaming WS protocol, and reconciling upstream's data layer with our own. We chose a smaller blast radius:

- The engine ships its own multi-agent orchestration in `engine/live_debate.py` — a sequential per-agent loop with role-specific prompts that mirror the *spirit* of upstream's agents (technical / fundamental / news / sentiment analysts, bull/bear/manager researchers, trader, three risk seats + portfolio manager).
- Each agent is a single per-provider chat completion call routed through `engine/llm_providers.LLMAdapter`. No LangGraph, no LangChain.
- Same wire shape as the canned stub debate — the renderer doesn't know whether a session was stub or live except via the `live: true` field on `session.complete`.
- Cost discipline lives in `live_debate.py` (NOT in adapters): `MAX_AGENTS_PER_SESSION=12` bounds the loop, `max_tokens` per call is bounded by `_MAX_TOKENS_HARD_CAP=800` enforced inside `ProviderConfig.from_dict`, estimated cost logged per session.
- Multi-provider support is allowlist-gated via `_ALLOWED_PROVIDERS`. Today: **OpenAI, Anthropic, OpenRouter, Google Gemini**. Unsupported providers fall through to the stub rather than erroring, so the renderer can ship UI ahead of engine support.
- Auth is a discriminated union on the WS start frame: `{type: "api_key", api_key}` or `{type: "oauth", access, refresh, expires}`. OAuth is OpenAI-only today (PKCE flow handled by `@earendil-works/pi-ai` per Clawless Advisor's reference pattern). `ProviderConfig.bearer_token` collapses both into a single accessor so adapters never branch on auth shape.

Future Phase 2.1-full may revisit upstream-graph integration — for now, the simpler path is the shipping path.

```python
# engine/live_debate.py — actual shape

@dataclass
class ProviderConfig:
    provider: str = "openai"
    api_key: str = ""
    model: str = "gpt-4o-mini"
    max_tokens: int = 400

async def live_debate(
    *, ticker, trade_date, summary, headlines, config: ProviderConfig
) -> AsyncIterator[dict]:
    # Yields the same event shapes as canned_debate(): session.start →
    # phase.transition × N → agent.message × 12 → session.complete (with
    # live=true and token/cost metadata).
    ...
```

| Path | When |
|---|---|
| `canned_debate` (stub) | No `provider_config` in WS start frame. Deterministic, free, used as the demo default. |
| `live_debate` (any allowlisted provider) | `provider_config.provider in {"openai", "anthropic", "openrouter", "gemini"}`. Real LLM calls bounded by the cost caps above; routed through `LLMAdapter`. |
| `ClawlessGatewayClient` (Phase 6) | Optional connector. Translates LLM calls to OpenClaw RPCs over the gateway WebSocket. Schema constraints: `client.id: "cli"`, `client.mode: "ui"`. Not yet implemented in engine. |

API-key-only for Anthropic — **OAuth banned** by Anthropic TOS. OpenAI OAuth shipped via `@earendil-works/pi-ai` (MIT, npm install + thin Electron wrapper at `desktop/electron/oauth-openai.ts`). Subscription-plan vs per-token-billing routing is determined by OpenAI based on the user's account configuration — TradingAgentsLab attaches the access token as `Authorization: Bearer …` and OpenAI routes accordingly. **Verify with a low-cost model first** before relying on OAuth for cost savings.

## 6. Data + broker abstraction

```python
# engine/data_providers/base.py — sketch
class BaseDataProvider(Protocol):
    def get_bars(self, ticker, start, end, interval) -> DataFrame: ...
    def get_quote(self, ticker) -> Quote: ...
    def get_fundamentals(self, ticker) -> dict: ...
    def get_news(self, ticker, since) -> list[NewsItem]: ...
```

Implementations: `YFinanceProvider` (default, free), `AlpacaProvider` (paid, founder's choice).

```python
# engine/brokers/base.py — sketch
class BaseBroker(Protocol):
    def submit_order(self, ticker, side, qty, type, mode) -> OrderResult: ...  # mode: "paper" | "live"
    def get_positions(self) -> list[Position]: ...
    def get_account(self) -> Account: ...
```

Initial implementation: `AlpacaBroker`. Live trading gated behind explicit user confirmation per marketing posture.

## 7. Settings page — built independently

**Strategy:** build our own Settings page from scratch in `desktop/src/pages/Settings.tsx`. No code copied from Clawless. All tabs treat their providers as equal optional connectors:

| Tab | Contents — what currently ships | Future |
|---|---|---|
| `LLM Providers` | API key fields for **OpenAI**, **Anthropic**, **OpenRouter**, **Google Gemini**. Anthropic is API-key-only (OAuth banned by TOS). Keys stored encrypted via Electron `safeStorage`. Active-provider chosen by `PROVIDER_PRIORITY` (first-configured-wins). | OpenAI OAuth (subscription-plan path); additional providers (xAI, Mistral, Qwen, GLM, etc.) added as engine wiring catches up — the secret schema generalizes. |
| `Data Providers` | yfinance shown as the active free default. Alpaca config field stored but engine wiring pending. | Per-call override from Analyze page; Alpaca live data feed in Phase 5 part 2. |
| `Broker` | Alpaca paper API key field (storage only — no orders yet). Alpaca live is restricted. | Order placement in Phase 5 part 2 with paper-only enforcement; live trading gated behind an explicit "I understand this is my decision" affordance. |
| `Clawless` | Gateway URL + token fields stored. | Phase 6 wires the gateway tap with protocol negotiation (`max=4` falling back to `3`, schema constants `client.id: "cli"` + `client.mode: "ui"`). |
| `About` | Version, license, encryption status, secrets file path, entry count. | — |

**Theme:** TradingAgentsLab picks its own aesthetic — warm amber `#f0a830` accent on `#0d1117` dark surface, system humanist + monospace pairing. Brand-level coherence with Clawless ecosystem achieved by independent design choices, not shared CSS.

**OAuth:** Standard OAuth flow for OpenAI follows public OpenAI SDK guidance. Do not reverse-engineer Clawless's implementation.

**Result:** launching TradingAgentsLab next to Clawless presents two visually-coherent ecosystem products without sharing implementation.

## 8. Phasing

| Phase | Scope | Status (2026-05-09) |
|---|---|---|
| **0** | Gateway probe + this architecture doc + license stack | ✅ done |
| **1** | `desktop/` Electron shell with independent theme tokens | ✅ done |
| **2** | `engine/` Python sidecar — FastAPI + stub canned debate | ✅ done |
| **2.1-light** | Real-LLM debate via sequential per-agent OpenAI calls (own prompts, not upstream graph) | ✅ done |
| **3** | Wire desktop ↔ sidecar with hardcoded ticker, stream agent debate | ✅ done |
| **4** | Settings page + BYO LLM keys (encrypted via `safeStorage`) | ✅ done (OAuth deferred) |
| **5 part 1** | yfinance default data + summary strip + news headlines | ✅ done |
| **5 part 2** | Alpaca data + paper-trading broker | ⚪ pending |
| **6** | Optional Clawless gateway tap | ⚪ pending |
| **7** | Watchlist + history pages, paper-trade P&L, distribution | 🟡 watchlist + history shipped; P&L + distribution pending |

Each phase ships a working app. No multi-week black box.

## 9. Open questions / pending decisions

- [ ] OpenClaw upstream PR for `client.id: "tradingagentslab"` (deferred, non-blocking)
- [ ] Whether to integrate Alpaca news/sentiment or use a separate news provider (defer to Phase 5)
- [ ] Distribution channel — direct download? Mac App Store? (defer to Phase 7)
- [ ] Auto-update mechanism (Squirrel? electron-updater?) (defer to Phase 7)

## 10. Resolved (recorded for posterity)

- ✅ Architecture pattern: standalone with optional Clawless connection (Pattern 3)
- ✅ Code inheritance question: no Clawless code reused — license-compatibility question dissolved
- ✅ CLAUDE.md template: build our own (Advisor confirmed Clawless template not portable)
- ✅ Theme strategy: independent aesthetic with brand-level coherence
- ✅ Multi-client gateway: works (verified)
- ✅ Protocol source of truth: OpenClaw npm package TypeScript types

## 11. Verified facts

- Multi-client OpenClaw gateway access — confirmed 2026-05-07 via `tools/clawless-probe.mjs`
- Clawless desktop + TradingAgentsLab probe coexisted on `ws://127.0.0.1:18789` without disruption
- Protocol version 3, frame envelope `{type, id (string), method, params}`, schema-validated client constants

## 12. Operational gotchas — Clawless gateway

When implementing the production `ClawlessGatewayClient` (Phase 6), handle these explicitly:

- **Session ownership:** each client creates its own sessions; not shared unless both clients reference the same `session_id`
- **Event fanout:** streaming events default to the initiating connection; cross-client observation events not fully documented — verify per RPC
- **Token rotation:** detect 401-style failures and prompt for re-pairing
- **Gateway lifecycle:** survives Clawless app exit but tied to install dir; handle "Clawless uninstalled" gracefully (fall through to standalone)
- **Version coupling:** Clawless pins OpenClaw 4.21; handle `RPC method not found` gracefully
- **Protocol negotiation:** try max=4, fall back to 3 on `protocol mismatch`
