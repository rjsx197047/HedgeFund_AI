# TradingAgentsLab — Backlog

> **Organization:** by phase (see [`docs/architecture.md`](docs/architecture.md) §8). Phases 0–2 are done; Phase 3 is the next deliverable.

## Status legend

- 🟢 done · 🟡 in progress · ⚪ pending · 🔴 blocked · 🟣 deferred

---

## Phase 0 — Foundation ✅ DONE

- 🟢 **Fork upstream + dual-license setup** — AGPL-3.0 + Apache 2.0 attribution, NOTICE, CLA, CONTRIBUTING. Pushed to `jaysidd/TradingAgentsLab`.
- 🟢 **Git remotes** — `origin` → TradingAgentsLab, `upstream` → TauricResearch/TradingAgents.
- 🟢 **Gateway probe** — `tools/clawless-probe.mjs`, multi-client OpenClaw access verified.
- 🟢 **Architecture doc** — `docs/architecture.md` v0.1 shipped. Iterates as later phases surface refinements.
- 🟢 **Backlog + Handover** — `backlog.md` + `Handover.md` in place and being maintained per-session.
- 🟢 **CLAUDE.md** — orchestration contract written from scratch (Clawless template was not portable per Advisor).
- 🟢 **Commit + push Phase 0 artifacts** — shipped in commit `f0125b8`.

## Phase 1 — Desktop shell ✅ DONE

- 🟢 Scaffold `desktop/` Electron app (TypeScript + React + Vite).
- 🟢 TradingAgentsLab theme tokens — dark surface (`#0d1117`), warm-amber accent (`#f0a830`), system humanist sans + monospace headings, subtle radial gradient.
- 🟢 App-shell window opens with title bar, sidebar nav (Analyze · Watchlist · History · Settings), main panel, footer with disclaimer.
- 🟢 Acceptance: founder approved on first look — *"I like the colors. It is nice light base, give that trading app feel. Great."*

## Phase 2 — Python sidecar ✅ DONE (stub layer)

- 🟢 Scaffold `engine/` FastAPI service (Python 3.13 venv via uv-managed interpreter).
- 🟢 Endpoints: `GET /health`, `POST /analyze` (one-shot stub), `WS /stream` (canned 16-event multi-agent debate over ~7s).
- 🟢 Stub debate sequence (`engine/stub_debate.py`) — analysts → phase.transition → researchers → trader → risk → portfolio_manager → session.complete.
- 🟢 Sidecar process startup: emits `{"port": <int>, "token": "..."}` JSON to stdout for Electron main to read.
- 🟢 Bearer-token auth on all endpoints (`Authorization: Bearer <token>` for HTTP, `?token=` query param for WS).
- 🟢 Acceptance verified: `/health` 200 with auth / 401 without; `/analyze` returns stub decision; `/stream` streams 16 events with realistic phasing.
- ⚪ Phase 2.1 (later): replace stub debate with real `tradingagents` core integration. Out of MVP scope.

## Phase 3 — End-to-end demo ✅ DONE

- 🟢 `desktop/electron/engine-runner.ts` — spawns `engine/.venv/bin/python -m engine` with `cwd: repoRoot`, parses first-line `{port, token}` via `stdout.once('data')`, tees uvicorn stderr with `[engine]` prefix, kills child on `before-quit` and `window-all-closed`.
- 🟢 `desktop/electron/main.ts` — calls `startEngine()` on `whenReady`, exposes `engine:get-handshake` IPC handler that awaits the cached handshake promise.
- 🟢 `desktop/electron/preload.ts` — `tradingAgentsLab.getEngineHandshake()` on the contextBridge, typed against the `EngineHandshake` interface.
- 🟢 `desktop/src/lib/engine-client.ts` — typed wrapper: `getHandshake()` (cached), `analyze(req)` (POST `/analyze` with bearer), `streamDebate(req, onEvent, onError)` (WS `/stream?token=...`, sends start frame, fires `onEvent` per message, returns `{close, done}` handle).
- 🟢 `desktop/src/components/DebateStream.tsx` + module.css — renders by phase with color-coded left borders, phase-aware labels, animated streaming badge, prominent decision card with action color-coding (HOLD = amber, BUY = green, SELL = red).
- 🟢 `desktop/src/pages/Analyze.tsx` — Analyze button enabled once engine handshake lands, "Analyzing…" while in flight, status card flips Engine to "Running" / "Error" / "Starting…" appropriately, error banner on stream failure.
- 🟢 `engine/server.py` — added `CORSMiddleware` for `http://localhost:5173` (renderer origin). Required for `/analyze` POST preflight; WS `/stream` is unaffected.
- 🟢 `desktop/src/vite-env.d.ts` — added ambient declarations for `*.module.css` and the `tradingAgentsLab` window bridge (Phase 1 had been failing type-check silently on the CSS imports — fixed in passing).
- 🟢 Acceptance verified: type-check passes, vite production build passes (155 KB JS gzipped 50 KB), engine endpoint contract green (`/health` 401/200, CORS preflight 200, `/analyze` returns HOLD, WS streams 17 events ending with HOLD@0.55 over ~7s, clean close 1000), Electron successfully spawns engine via `app.getAppPath()` path resolution. **Final UI click-through pending founder review** — no Electron Playwright driver was set up to drive the button.

## Phase 4 — Settings page

- 🟢 **Phase 4 spike (UI scaffolding)** — Settings page reachable via sidebar with hash-based routing, 5 tabs (LLM Providers, Data Providers, Broker, Clawless, About) with disabled "Configure" buttons and a phase-guard footer explaining wiring lands later. Watchlist + History pages render `ComingSoon` placeholders.
- 🟢 **Phase 4 main: secret storage layer** — Electron `safeStorage`-backed (no native deps; OS keychain on macOS, DPAPI on Windows, libsecret on Linux). Versioned JSON schema at `<userData>/secrets.json`. Hard-fails when `safeStorage.isEncryptionAvailable()` returns false. IPC: `secrets:availability/set/get/list/delete`. Renderer wrapper at `desktop/src/lib/secrets.ts`.
- 🟢 **Phase 4 main: Settings UI wiring** — LLM Providers (OpenAI, Anthropic, DeepSeek, OpenRouter), Data Providers (Alpaca; yfinance shown as Active default), Broker (Alpaca paper/live), Clawless (gateway URL + token) all wired through the secrets bridge. Inline "Configure / Replace / Delete" with masked-tail (`…last4`) + relative timestamp on stored entries. About tab shows the secrets file path explicitly so backups/migration are obvious.
- ⚪ Real LLM key validation ("Test connection" button) — intentionally **not** in this commit; would burn quota on the founder's key. Belongs in a follow-up gated on founder go-ahead.
- ⚪ OAuth flow for OpenAI (per public OpenAI SDK docs). **No Anthropic OAuth** (TOS).
- ⚪ Engine consumption: thread provider config from renderer into `/analyze` + WS `/stream` start frame. **Held for Phase 2.1** — wiring shape depends on which provider founder picks first.
- ⚪ Acceptance: founder pastes his real OpenAI key, runs analysis, key persists across restarts.

## Phase 5 — Data + broker

- 🟢 **Phase 5 part 1 (yfinance default data)** — `engine/data_providers.py` ships `BaseDataProvider` Protocol + `QuoteSummary` dataclass + `YFinanceProvider` impl. New `GET /data/summary` endpoint with 404 on unknown tickers. WS `/stream` emits a `data.summary` event before the canned debate, and analyst/researcher/trader messages inject real numbers (last close, period change, volume, range). Renderer surfaces a compact summary strip (last close · period change · range · avg volume · source) above the debate. yfinance added to `engine/requirements.txt`.
- ⚪ `AlpacaProvider` data — needs Alpaca API key + keychain plumbing (gated on Phase 4 keychain commit).
- ⚪ Data Providers settings tab — wire beyond placeholder.
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

## Stretch — feature spikes (additive, no architectural commitments)

- 🟢 **News headlines via yfinance** — `Headline` dataclass + `news_headlines()` on the data provider Protocol, `GET /data/news` endpoint, `news.headlines` WS event before the debate, news_analyst stub now bullets real Yahoo Finance headlines, renderer surfaces a linked News card above the debate, transcript export includes the news section.
- 🟢 **Keyboard shortcuts + Electron app menu** — full menu bar (File / Edit / Go / View / Window / Help, plus App on macOS). Accelerators: Cmd+N new analysis, Cmd+. stop, Cmd+, settings, Cmd+1/2/3 nav. Page-level Cmd+Enter to run analysis. Help links to GitHub repo + issues page.

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
