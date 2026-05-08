# TradingAgentsLab — Worklog

> **Purpose:** Chronological day-by-day record of what shipped each session. Complement to [`backlog.md`](backlog.md) (status by phase) and [`Handover.md`](Handover.md) (current state). When you want "what did we do yesterday vs today," read this. When you want "what's left," read `backlog.md`. When you want "where do I pick up," read `Handover.md`.
>
> **Format:** Newest entries on top. Each session gets a date header, a one-line goal, bulleted commits with hashes, and a "next session opens with" line.

---

## 2026-05-08 — Phase 3: end-to-end debate streaming + autonomous block

**Goal:** Wire the Electron renderer to the Python sidecar so clicking "Analyze NVDA" streams the canned debate into the UI. Stretch: scaffold Phase 4 settings page (no keychain yet) per advisor green-light.

**Shipped (Phase 3):**

- New: `desktop/electron/engine-runner.ts` — spawns sidecar with `cwd: repoRoot` (so `python -m engine` resolves the package via `sys.path[0]`), parses first-line `{port, token}` JSON via `stdout.once('data')`, tees uvicorn stderr with `[engine]` prefix, kills child on `before-quit` and `window-all-closed`.
- Updated: `desktop/electron/main.ts` — calls `startEngine()` eagerly on `app.whenReady`, exposes `engine:get-handshake` IPC handler that awaits the cached promise (no race between renderer mount and sidecar boot).
- Updated: `desktop/electron/preload.ts` — exposes `getEngineHandshake()` on the `tradingAgentsLab` contextBridge.
- New: `desktop/src/lib/engine-client.ts` — typed wrappers: `getHandshake()` (cached), `analyze()` (POST `/analyze` with bearer header), `streamDebate(req, onEvent, onError)` (WS `/stream?token=...`, returns `{close, done}` handle, treats close codes 1000 + 1005 as clean).
- New: `desktop/src/components/DebateStream.tsx` + `DebateStream.module.css` — phase-grouped messages with color-coded left borders (analysts amber, researchers darker amber, trader bright amber, risk neutral gray), animated streaming badge, prominent decision card with action-aware coloring (HOLD amber, BUY green, SELL red).
- Updated: `desktop/src/pages/Analyze.tsx` — Analyze button enabled once handshake lands ("Analyzing…" while in flight), Engine status card flips to Running/Error/Starting, error banner on stream failure, ticker/date inputs disabled during stream.
- Updated: `desktop/src/pages/Analyze.module.css` — added `statusDotOk`, `statusDotError`, `errorBanner` styles.
- Updated: `engine/server.py` — added `CORSMiddleware` for `http://localhost:5173` (renderer origin). Required so the renderer's POST to `/analyze` passes its CORS preflight; WS `/stream` bypasses CORS but is harmlessly covered.
- New: `desktop/src/vite-env.d.ts` — ambient type declarations for `*.module.css` and the `tradingAgentsLab` window bridge. Phase 1 had been silently failing type-check on the CSS module imports — fixed in passing as part of Phase 3 since the same file declares the bridge.

**Verification:**

- `npm run type-check` clean
- `npm run build` clean (155 KB JS gzip 50 KB, plus electron main + preload bundles)
- Engine endpoint contract green via curl + node WebSocket smoke:
  - `/health` 401 without bearer / 200 with bearer ✓
  - CORS preflight (`OPTIONS /analyze` from origin `http://localhost:5173`) returns 200 with correct allow-origin/methods/headers ✓
  - `/analyze` returns stub HOLD@0.5 ✓
  - `WS /stream?token=...` streams 17 events covering all 4 phases (analysts, researchers, trader, risk), ends with `session.complete` carrying decision HOLD@0.55, clean close code 1000 ✓
- Electron successfully spawns the engine via `app.getAppPath()` path resolution — verified by inspecting `ps` after `npm run dev` (sidecar PID listening on `127.0.0.1:<random-port>`)
- Final UI click-through: pending founder review when they return (no Electron Playwright driver was set up to drive the button — every other piece of the contract is verified)

**Commits:**

- `<Phase 3 hash>` — Phase 3: wire desktop renderer to engine sidecar end-to-end

**Stretch / what came after Phase 3 in this autonomous block:** see entries appended below as work continues.

**Next session opens with:** depends on autonomous block outcome — see latest entry. If Phase 3 is the only thing that landed, founder should smoke-test it via `npm run dev`, click Analyze NVDA, expect 17 events ending with HOLD@0.55. If Phase 4 scaffolding also landed, founder should additionally check the Settings route + tab structure (no functional keychain yet — that's a separate commit gated on founder approval per advisor scope guard).

---

## 2026-05-07 — Phases 0, 1, 2: foundation → desktop shell → sidecar

**Goal:** Stand up the project from a fresh fork through a working app shell + a sidecar that can stream a fake debate. Three phases shipped.

**Commits (chronological):**

- `f68a7d7` — Re-license fork as TradingAgentsLab under AGPL-3.0 + CLA (LICENSE, LICENSE-APACHE, NOTICE, CLA.md, CONTRIBUTING.md)
- `f0125b8` — **Phase 0**: orchestration docs + gateway probe (`tools/clawless-probe.mjs`, `docs/architecture.md`, `CLAUDE.md`, `Handover.md`, `backlog.md`)
- `86f0185` — **Phase 1**: scaffold Electron + Vite + React desktop shell (warm-amber theme on dark base, founder approved on first look)
- `a44b935` — **Phase 2**: Python sidecar with FastAPI + stub canned debate (`/health`, `/analyze`, `/stream` with bearer auth)
- `81f7414` — Handover checkpoint at end of Phase 2 (paused to save Opus quota)
- `e527632` — Pre-reboot wrap-up: refresh Handover + backlog for clean session resume

**Verified during the session:**

- Multi-client OpenClaw gateway access — TradingAgentsLab connected as a second client alongside Clawless desktop on `ws://127.0.0.1:18789`, ran `connect` + `health`, full agent inventory returned (gateway protocol is `req/res/event` envelope, not JSON-RPC; protocol version 3; `client.id: "cli"`, `client.mode: "ui"` are the working schema constants)
- Engine sidecar acceptance: `/health` 200 with bearer / 401 without, `/analyze` returns stub HOLD decision, `/stream` streams 16 canned events over ~7s, clean WS close (code 1000)
- Visual identity: warm amber `#f0a830` accent on `#0d1117` dark surface ratified by founder

**Decisions locked in:**

- "Connection, not integration" — TradingAgentsLab connects to Clawless the way it connects to Alpaca/yfinance (one of N optional connectors). No code inheritance, no shared CSS.
- Anthropic OAuth banned (TOS); API key only. OpenAI accepts both.
- yfinance default, Alpaca optional. Massive.com deferred.
- Sub-agents default to Sonnet/Haiku (cost discipline).
- `Clawless Advisor` is the cross-product channel (ClaudeLink role).

**Next session opens with:** Phase 3 — wire renderer ↔ engine. File plan in `Handover.md`.
