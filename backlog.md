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
- 🟢 **Phase 2.1-light: real-LLM debate** — `engine/live_debate.py` ships a sequential per-agent loop with role-specific prompts mirroring the spirit of upstream's agents (4 analysts → 3 researchers → trader → 4 risk seats). `provider_config` in the WS start frame triggers it; absent → falls through to the canned stub. Cost discipline baked in: `MAX_AGENTS=12`, `_MAX_TOKENS_HARD_CAP=800`. Decision card surfaces live metadata (provider, model, tokens, est cost). **Note:** Phase 2.1-full (wrapping upstream's `TradingAgentsGraph` directly) is deferred — see `docs/architecture.md` §5 for the rationale.
- 🟢 **Multi-provider: OpenAI + Anthropic + OpenRouter + Google Gemini** — `engine/llm_providers.py` ships a shared `LLMAdapter` Protocol with per-provider implementations. Active provider in renderer chosen by `PROVIDER_PRIORITY` (first-found-key wins). Adapter lifecycle is try/finally guarded so client disconnects mid-stream don't leak the pooled httpx client. `session.complete` carries `provider` field; History persists and surfaces it.
- 🟢 **User-facing "Run with: …" provider override on Analyze** — dropdown shows all 4 providers in priority order. Configured ones are selectable; unconfigured show "— configure in Settings" and are disabled. Choice persists across app sessions via localStorage with mount-time validation (saved choice is dropped if its credentials disappear). Reset button next to dropdown when a manual override is active. Closure-capture race in `onAnalyze` guarded by `activeProviderRef` + `openaiAuthKindRef` (same pattern as `isStreamingRef`).
- 🟢 **OpenAI OAuth (subscription-plan path)** — `@earendil-works/pi-ai` (MIT) handles the PKCE + browser callback + token exchange; thin Electron wrapper at `desktop/electron/oauth-openai.ts` stores tokens via existing `safeStorage`, refresh-on-stale via `refreshOpenAICodexToken` with a single-flight mutex, 20s manual-paste fallback. Settings → LLM Providers gains a "Connect" row; OAuth wins over API key when both are stored. **Subscription-plan routing depends on OpenAI's per-account configuration** — user verifies with a low-cost call before relying on this for cost savings.

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

## Phase 5 — Data only (broker work removed per locked positioning 2026-05-09)

> **Positioning lock (2026-05-09):** TradingAgentsLab is an analysis tool, not an execution platform. Original Phase 5 part 2 ("AlpacaBroker paper-trading") is OUT — see CLAUDE.md §3 + memory `project_positioning_analysis_only.md`. Replaced with Phase 5b (data-only Alpaca) and Phase 8 (webhooks for external broker handoff).

- 🟢 **Phase 5 part 1 (yfinance default data)** — `engine/data_providers.py` ships `BaseDataProvider` Protocol + `QuoteSummary` dataclass + `YFinanceProvider` impl. New `GET /data/summary` endpoint with 404 on unknown tickers. WS `/stream` emits a `data.summary` event before the canned debate, and analyst/researcher/trader messages inject real numbers (last close, period change, volume, range). Renderer surfaces a compact summary strip (last close · period change · range · avg volume · source) above the debate. yfinance added to `engine/requirements.txt`.
- ⚪ **Phase 5b: AlpacaDataProvider** — engine adapter for `data.alpaca.markets` (and read-only paper endpoints if needed for the analysis context). Hard-coded URL constants — no live endpoint anywhere in the adapter, so a pasted live key structurally cannot execute orders. Settings UI for the Alpaca Markets Key ID + Secret already shipped (`Settings.tsx` Data Providers tab). Renderer's "Data" status card flips to "Alpaca · live" when configured, falls back to "yfinance · live" when not.
- 🚫 ~~`BaseBroker` abstraction; `AlpacaBroker` paper-trading~~ — REMOVED. Adding broker-execution code shifts product identity from analysis lab to trading app and is rejected per locked positioning.
- 🚫 ~~Broker settings tab~~ — REMOVED from UI (commit `<this commit>`). Encrypted secrets file may have orphan `broker:alpaca-paper-*` entries from earlier today; harmless, never read.
- ⚪ Acceptance: founder runs analysis with Alpaca data, sees the "Data" status card flip to "Alpaca · live", and the analysis context block uses Alpaca's data instead of yfinance's.

## Phase 6 — Optional Clawless tap

- ⚪ `ClawlessGatewayClient` — translates LLM calls to OpenClaw RPCs.
- ⚪ Protocol negotiation: try max=4, fall back to 3 on `protocol mismatch`.
- ⚪ Settings tab: "Connect to Clawless (optional)" — gateway URL + token paste.
- ⚪ Detect-and-route: if configured + reachable, route through gateway; else fall through to BYO.
- ⚪ UI badge: "Standalone" vs "Connected to Clawless".
- ⚪ Acceptance: founder pastes his Clawless token, all subsequent analyses route through Clawless gateway, badge updates.

## Phase 7 — Real product surface

- 🟢 **Watchlist page** — replaces the ComingSoon placeholder. SQLite-backed. Add ticker (with optional note) form, list view with relative timestamp, "Analyze" deep-link that hands the ticker off to the Analyze page via sessionStorage, "Remove" with confirm. New endpoints: `GET /watchlist`, `POST /watchlist` (409 on duplicate, 422 on bad input), `DELETE /watchlist/{ticker}` (404 on missing).
- ⚪ Watchlist daily re-analyze cadence — Phase 7 follow-up.
- 🟢 **History page** — replaces the ComingSoon placeholder. List view of saved debates (newest first), click into a detail view that replays the persisted DebateStream, delete with confirmation, copy transcript markdown. Reads `GET /sessions` + `GET /sessions/{id}` + `DELETE /sessions/{id}`. Race-guarded against rapid row clicks via generation counter.
- 🚫 ~~Paper-trade P&L integration into History~~ — REMOVED with the broker abstraction. Manual paper-trade tracking via webhooks (Phase 8) replaces this if needed.
- ⚪ Detail-fetch timeout — getSession has no timeout; if the engine hangs the user is stuck on "Loading session…" until they click Back. Add an AbortController-based 5-10s timeout in `engine-client.getSession`. Low priority (engine doesn't currently hang).
- ⚪ Settings persistence (window size, theme mode, etc.).
- ⚪ Distribution: signed macOS DMG, Windows installer (deferred decision on auto-update mechanism).
- ⚪ Acceptance: founder uses the app daily for paper-trading research without relying on the dev shell.

## Phase 8 — Webhooks for external broker handoff (replaces broker integration)

> **Replaces** the original Phase 5 broker work per locked positioning 2026-05-09. Users connect their analysis output to *their own* authorized brokerage account (Interactive Brokers, Alpaca live, etc.) — execution happens on the regulated platform, not in our app.

- ⚪ Settings → Webhooks tab — outbound webhook URL configuration. Per-webhook: name, URL, optional bearer token, event filter (e.g. only fire on BUY decisions, only above a confidence threshold).
- ⚪ Engine: outbound POST emitted on `session.complete` to each configured webhook. Body includes ticker, decision, confidence, reasoning, full transcript URL (locally addressable session id), and a HMAC signature for receiver verification.
- ⚪ Renderer: per-debate "Sent to webhooks" indicator with success / failure / retry state per endpoint.
- ⚪ Documentation: webhook payload schema in `docs/api.md`. Example receiver scripts (Node + Python) in `docs/kb/webhooks.md` showing how to wire to IB / Alpaca / a custom Slack bot.
- ⚪ Acceptance: founder configures a webhook pointing to a local script that logs the payload; runs an analysis; sees the webhook fired with the correct payload + signature.

---

## Stretch — feature spikes (additive, no architectural commitments)

- 🟢 **News headlines via yfinance** — `Headline` dataclass + `news_headlines()` on the data provider Protocol, `GET /data/news` endpoint, `news.headlines` WS event before the debate, news_analyst stub now bullets real Yahoo Finance headlines, renderer surfaces a linked News card above the debate, transcript export includes the news section.
- 🟢 **Keyboard shortcuts + Electron app menu** — full menu bar (File / Edit / Go / View / Window / Help, plus App on macOS). Accelerators: Cmd+N new analysis, Cmd+. stop, Cmd+, settings, Cmd+1/2/3 nav. Page-level Cmd+Enter to run analysis. Help links to GitHub repo + issues page.
- ⚪ **Streaming progress UX (medium priority, founder-flagged 2026-05-09)** — first agents render in ~5-10s but a full gpt-5.4 debate takes 40-50s end-to-end. New users scroll down at 10s, see a couple of analyst messages, and assume the debate is done. Today's only signal is a small "Streaming" badge in `DebateStream.tsx:144-147`. Build a more prominent processing indicator: phase progress chip (e.g. "Phase 2 of 4: Researchers · 6 / 12 agents"), animated spinner / pulse while the WS is open, and a green "✓ Complete" state with elapsed time once `session.complete` fires. Phase data is already on the wire via `phase.transition` events; per-agent count derives from the events array. Pure renderer change — zero engine work. Affected files: `desktop/src/components/DebateStream.tsx` + module CSS, possibly a new `<DebateProgress />` sibling component.
- ⚪ **Crypto ticker routing (medium priority, founder-discovered 2026-05-09)** — pasting a crypto symbol like `BTC` into Analyze silently fetches data for the WRONG asset. Repro: with Alpaca configured, run analysis on `BTC` — `[alpaca] bars OK BTC → 25 bars · close=$35.47 change=+15.39%` (this is some equity using the BTC ticker, not bitcoin which trades in tens of thousands). The debate runs to completion with valid-looking output but is analyzing the wrong asset. Root cause: `AlpacaProvider.quote_summary` hits `/v2/stocks/{symbol}/bars` which is equities-only; Alpaca's crypto endpoint is `/v1beta3/crypto/us/bars` with symbol format `BTC/USD`. Two-part fix: (a) defensive — detect crypto-style intent in the renderer and either refuse with "crypto needs /USD suffix" or route to yfinance which knows `BTC-USD` natively; (b) proper — add a crypto branch to `AlpacaProvider` that uses the crypto endpoint with the correct symbol format. Affected files: `engine/data_providers.py` (~30-40 LoC for crypto branch), possibly `desktop/src/pages/Analyze.tsx` for ticker validation. Same-class issue may exist for futures, options, and non-US tickers.

---

## Tooling + docs

- 🟢 **`tools/dev-smoke.sh`** — backend smoke runner (12 assertions covering auth + CORS + every HTTP endpoint + WS contract + sessions round-trip). Run when the UI isn't streaming to rule the backend out, or as a fresh-session sanity check.
- 🟢 **`docs/api.md`** — engine API contract documentation. Every endpoint shape, the WS event types + order, agent name canon per phase, process model, intentional out-of-scope list. Indexed in `CLAUDE.md` doc graph.
- 🟢 **`docs/kb/`** — user-facing knowledge base (11 files): README index, getting-started, how-it-works, configuring-llm-providers, data-providers, clawless-connector, reading-the-debate, keyboard-shortcuts, security-and-storage, troubleshooting, faq. Cross-linked, posture-locked ("educational + paper trading"), single-source for end-user-facing language. Built by parallel sub-agent.
- 🟢 **Engine SQLite session storage** — `engine/storage.py` with versioned schema, write-on-stream-end, list/get/delete endpoints. WAL mode, atomic file create, best-effort error handling. DB lives at `<repo>/data/sessions.db` (gitignored), overridable via `TAL_SESSIONS_DB`.

---

## Tomorrow's queue (autonomous, founder pre-authorized)

- ⚪ **CostGuard + budget caps** — Clawless Advisor pattern: SQLite-backed config + state, TOCTOU reservation, IPC `check`/`complete`, modal override UX with anti-tamper, global (not per-provider). Extension for stacked daily/weekly/monthly + rate-cap dimension for OAuth. Per founder's directive: OAuth path returns `cost === 0` and naturally skips; API-key path collects per-token cost.
- ⚪ **Playwright + Electron testing** — set up Playwright with Electron driver, smoke tests for provider dropdown / model dropdown / OAuth Connect / debate stream rendering. Closes the "UI not click-tested autonomously" gap.
- ⚪ **JWT plan-tier detection** in `oauth-openai.ts` — decode OAuth access token, extract `chatgpt_plan_type`, surface banner for free-tier accounts (Codex unreliable on free per Clawless Advisor B34).
- ⚪ **Reviewer pass on model picker** (`c81b1d0`) — skipped in the rush.

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
