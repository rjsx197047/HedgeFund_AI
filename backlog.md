# TradingAgentsLab — Backlog

> **Note:** Initial structure pending Clawless `CLAUDE.md` template (will reformat once Clawless Advisor returns it). For now, organized by phase (see [`docs/architecture.md`](docs/architecture.md) §8).

## Status legend

- 🟢 done · 🟡 in progress · ⚪ pending · 🔴 blocked · 🟣 deferred

---

## Phase 0 — Foundation

- 🟢 **Fork upstream + dual-license setup** — AGPL-3.0 + Apache 2.0 attribution, NOTICE, CLA, CONTRIBUTING. Pushed to `jaysidd/TradingAgentsLab`.
- 🟢 **Git remotes** — `origin` → TradingAgentsLab, `upstream` → TauricResearch/TradingAgents.
- 🟢 **Gateway probe** — `tools/clawless-probe.mjs`, multi-client OpenClaw access verified.
- 🟡 **Architecture doc** — `docs/architecture.md` v0.1 written; iterates as Phase 1+ surfaces refinements.
- 🟡 **Backlog + Handover** — initial scaffolding (this file + `Handover.md`).
- 🟡 **CLAUDE.md** — Advisor confirmed: build our own (Clawless template not portable). In progress.
- ⚪ **Commit + push Phase 0 artifacts** — probe, architecture doc, backlog, handover, CLAUDE.md.

## Phase 1 — Desktop shell

- ⚪ Scaffold `desktop/` Electron app (TypeScript + React).
- ⚪ Define TradingAgentsLab's own theme tokens — dark surface, complementary accent (not Clawless cyan), humanist sans body + monospace headings, subtle grid background.
- ⚪ App-shell window opens with placeholder content. No engine yet.
- ⚪ Acceptance: launch TradingAgentsLab and the window has clear, distinct, polished branding that feels ecosystem-coherent with Clawless without copying it.

## Phase 2 — Python sidecar

- ⚪ Scaffold `engine/` FastAPI service wrapping `tradingagents.graph.TradingAgentsGraph`.
- ⚪ Endpoints: `POST /analyze` (one-shot), `WS /stream` (live agent debate stream).
- ⚪ Stub LLM provider (returns canned responses) so we can test wiring without burning tokens.
- ⚪ Sidecar process startup: emit `{port, token}` JSON to stdout for Electron main to read.
- ⚪ Acceptance: from Electron main, spawn sidecar, hit `/analyze` with a stub config, get a stub response.

## Phase 3 — End-to-end demo

- ⚪ Wire renderer → sidecar over WebSocket.
- ⚪ Hardcoded ticker (e.g., NVDA) + date in renderer; press button → stream agent debate live.
- ⚪ Replace stub LLM with real OpenAI call (env-var key) for the first real run.
- ⚪ Acceptance: founder clicks "Analyze NVDA" and watches the analyst → researcher → trader → risk manager debate stream into the UI.

## Phase 4 — Settings page

- ⚪ Build Settings page from scratch (no Clawless inheritance).
- ⚪ LLM Providers tab — BYO keys for all supported providers + OAuth flow for OpenAI (per public OpenAI SDK docs). **No Anthropic OAuth** (TOS).
- ⚪ Wire OS keychain (keytar) for secret storage.
- ⚪ Move hardcoded keys → keychain-backed config.
- ⚪ Acceptance: founder pastes his real OpenAI key, runs analysis, key persists across restarts.

## Phase 5 — Data + broker

- ⚪ `BaseDataProvider` abstraction; `YFinanceProvider` (default) + `AlpacaProvider`.
- ⚪ Data Providers settings tab.
- ⚪ `BaseBroker` abstraction; `AlpacaBroker` paper-trading.
- ⚪ Broker settings tab — live-trading gated behind "I understand this is my decision" affordance.
- ⚪ Acceptance: founder runs analysis with Alpaca data, places paper-trade order from the recommendation.

## Phase 6 — Optional Clawless tap

- ⚪ `ClawlessGatewayClient` — translates LLM calls to OpenClaw RPCs.
- ⚪ Protocol negotiation: try max=4, fall back to 3 on `protocol mismatch`.
- ⚪ Settings tab: "Connect to Clawless (optional)" — gateway URL + token paste.
- ⚪ Detect-and-route: if configured + reachable, route through gateway; else fall through to BYO.
- ⚪ UI badge: "Standalone" vs "Connected to Clawless".
- ⚪ Acceptance: founder pastes his Clawless token, all subsequent analyses route through Clawless gateway, badge updates.

## Phase 7 — Real product surface

- ⚪ Watchlist page — multiple tickers, daily re-analyze.
- ⚪ History page — past decisions, paper-trade P&L, decision-log integration.
- ⚪ Settings persistence (window size, theme mode, etc.).
- ⚪ Distribution: signed macOS DMG, Windows installer (deferred decision on auto-update mechanism).
- ⚪ Acceptance: founder uses the app daily for paper-trading research without relying on the dev shell.

---

## Cross-cutting / deferred

- 🟣 OpenClaw upstream PR to register `client.id: "tradingagentslab"` constant (non-blocking — `"cli"` works).
- 🟣 Massive.com / Polygon-class data provider (defer until a feature actually needs it).
- 🟣 Tauri/Wails port (not happening — Electron is the right call given Clawless inheritance).
- 🟣 Live-trading enablement for general public (founder-only for now; revisit post-GA).
- 🟣 Mobile companion (out of scope for this phase plan).

## Resolved Advisor questions (2026-05-07 reply)

- 🟢 CLAUDE.md template — Advisor: build our own; Clawless template not portable
- 🟢 Handover/backlog skeletons — generic patterns, no Clawless inheritance
- 🟢 Settings page component tree — Advisor: build our own (license question dissolves with no inheritance)
- 🟢 Theme tokens — Advisor: pick our own aesthetic, brand-level coherence not CSS-level copying
- 🟢 Multi-client gateway gotchas — captured in `docs/architecture.md` §12 and gateway memory file
