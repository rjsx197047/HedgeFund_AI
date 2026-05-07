# TradingAgentsLab — Architecture

> **Status:** v0.1 sketch — ratified by founder on 2026-05-07. Will iterate as Phase 1+ work surfaces refinements.
> **Companion docs:** [`backlog.md`](../backlog.md) — phased work items · [`Handover.md`](../Handover.md) — session-to-session context · [`CLAUDE.md`](../CLAUDE.md) — orchestration rules (pending Clawless template).

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
| Engine | **Python 3.13 sidecar** | TradingAgents core is Python; keep it native. |
| IPC | **FastAPI on `127.0.0.1`** (HTTP + WebSocket) | Streaming agent debate over WS; one-shot calls over HTTP. |
| LLM provider | **Two-mode abstraction** | (1) BYO keys default, (2) optional Clawless gateway tap. Same interface, two transports. |
| Data | **yfinance default + Alpaca optional** | yfinance keeps public free; Alpaca for power users (founder). Massive.com / Polygon-class deferred. |
| Broker | **Alpaca paper trading** (default), live trading gated | Aligns with educational posture. |
| Storage | **SQLite** (better-sqlite3 in Electron, sqlite3 in Python) | Mirrors Clawless. |
| Secrets | **OS keychain via `keytar`** | Never plaintext. |

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

```python
# engine/llm_providers/base.py — sketch
class BaseLLMClient(Protocol):
    async def complete(self, messages, model, **kwargs) -> str: ...
    async def stream(self, messages, model, **kwargs) -> AsyncIterator[str]: ...
```

Two implementations:

| Class | Description |
|---|---|
| `BYOClient` | Direct OpenAI/Anthropic/Gemini/xAI/DeepSeek/Qwen/GLM/OpenRouter calls using user-pasted keys (or OAuth-issued OpenAI tokens). API key only for Anthropic — **OAuth banned** by Anthropic TOS. |
| `ClawlessGatewayClient` | Translates LLM calls to OpenClaw RPCs over the gateway WebSocket. Protocol negotiation: try max=4, fall back to 3. Schema constraints: `client.id: "cli"`, `client.mode: "ui"` until upstream registers a TradingAgentsLab constant. |

Provider can be selected per-call in TradingAgents config (e.g., Anthropic for analysts, OpenAI for trader).

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

**Strategy:** build our own Settings page from scratch in `desktop/src/renderer/pages/Settings/`. No code copied from Clawless. All tabs treat their providers as equal optional connectors:

| Tab | Contents |
|---|---|
| `LLMProviders` | Per-provider API key fields. **OpenAI:** API key OR OAuth (both supported). **Anthropic:** API key ONLY (OAuth banned by TOS). Gemini, xAI, DeepSeek, Qwen, GLM, OpenRouter: API key. Keys stored in OS keychain via `keytar`. |
| `DataProviders` | yfinance (default, free) / Alpaca (paid). User picks default; per-call override possible from Analyze page. |
| `Broker` | Alpaca paper (default). Live trading gated behind explicit "I understand this is my decision" affordance. |
| `Connections` | Optional external service connections — including the **"Connect to Clawless"** sub-section: gateway URL + token + "Test connection" button. Same UI pattern as Alpaca config. No special elevation. |

**Theme:** TradingAgentsLab picks its own aesthetic. Brand-level coherence with Clawless ecosystem (compatible dark surface, compatible humanist font pairing, complementary accent color — *not* the same Clawless cyan), achieved by independent design choices.

**OAuth:** Standard OAuth flow for OpenAI follows public OpenAI SDK guidance. Do not reverse-engineer Clawless's implementation.

**Result:** launching TradingAgentsLab next to Clawless presents two visually-coherent ecosystem products without sharing implementation.

## 8. Phasing

| Phase | Scope | Outcome |
|---|---|---|
| **0** | Commit gateway probe + this architecture doc | Foundation in repo |
| **1** | `desktop/` Electron shell with Clawless theme tokens | Visual sister-product confirmed |
| **2** | `engine/` Python sidecar — FastAPI wrapping `tradingagents`, stub LLM provider | Sidecar speaks |
| **3** | Wire desktop ↔ sidecar with hardcoded ticker, stream first agent debate | Real demo |
| **4** | Settings page (inherited) + BYO LLM keys + OS keychain | Founder runs analysis with own keys |
| **5** | yfinance + Alpaca data provider, paper-trading broker | Founder paper-trades from app |
| **6** | "Connect to Clawless" tap (settings tab + ClawlessGatewayClient) | Optional gateway routing |
| **7** | Watchlist + history/P&L pages | Real product surface |

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
