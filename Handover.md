# TradingAgentsLab — Handover

> **Purpose:** Session-to-session context bridge. If you (Claude or human) are picking this up cold, read this first. Status by phase in [`backlog.md`](backlog.md). Chronological session log in [`WORKLOG.md`](WORKLOG.md). Detailed design in [`docs/architecture.md`](docs/architecture.md). Orchestration rules in [`CLAUDE.md`](CLAUDE.md).

## What this project is

**TradingAgentsLab** — github.com/jaysidd/TradingAgentsLab. AGPL-3.0 fork of Tauric Research's TradingAgents (multi-agent LLM trading research framework). Positioned as the **"standalone trading companion for Clawless"**.

**Connection, not integration.** TradingAgentsLab connects to Clawless the same way it connects to Alpaca or Yahoo Finance — one of N optional connectors. **No code inheritance from Clawless.** No shared CSS, no copied components. Brand-level coherence achieved through independent design.

**Posture:** open-source educational lab + paper trading. Never recommend real-money trading.

**Owner:** Junaid Siddiqi, founder. Treats Claude as principal developer/architect for TradingAgentsLab.

## Where we are right now (as of 2026-05-08 — Phase 3 shipping)

### Session in progress

- ✅ Founder rebooted machine cleanly (yesterday's wrap-up worked — `e527632` on origin/main)
- ✅ Registered as `trading-agents-lab` developer on ClaudeLink
- ✅ Phase 3 shipped — renderer ↔ engine wired end-to-end (see Phase 3 entry in `WORKLOG.md` and `backlog.md`)
- ⏳ Continuing into Phase 4 spike (settings page scaffolding) per advisor green-light for unsupervised stretch scope
- ⏳ Founder away ~4-5 hours; report on return

### Done — Phase 0 → Phase 3 + Phase 4 + spikes + tooling

**Yesterday (2026-05-07):** Phases 0, 1, 2 + license setup.

**Today (2026-05-08), autonomous blocks (~9 feature commits, founder away):**

Block 1 (~4 commits):

- ✅ **Phase 3** — renderer ↔ engine wired end-to-end (`c5815fa`). Click "Analyze NVDA" → 17-event debate streams in over ~7s → decision card.
- ✅ **Phase 4 spike** — Settings page + hash router (`e716d86`). All tabs visible, `Configure` buttons disabled, phase-guard explains.
- ✅ **Phase 5 part 1 — yfinance data integration** (`5273904`). Real NVDA data flows: $211.50 last close, +19.38% over 24 sessions, 147M avg volume.
- ✅ **Phase 5 polish** (`de030ee`). Stop button while streaming. Data status card flips to "yfinance · live". Copy transcript (Markdown) action.

Block 2 (~4 commits, this run):

- ✅ **Phase 4 main — secret storage + Settings UI wiring** (`f3b9543`). safeStorage-backed (no native deps), versioned JSON schema, hard-fails on no encryption available, never re-displays stored values. About tab shows the `<userData>/secrets.json` path so founder knows where the encrypted blob lives.
- ✅ **News headlines via yfinance** (`a984179`). `GET /data/news` endpoint, `news.headlines` WS event before debate, news_analyst stub now bullets real Yahoo Finance headlines, renderer surfaces a linked News card, transcript export includes news section.
- ✅ **Keyboard shortcuts + Electron app menu** (`0de893a`). Real menu bar with mac-aware structure. Cmd+N (new analysis), Cmd+. (stop), Cmd+, (settings), Cmd+1/2/3 (nav). Page-level Cmd+Enter (run) on Analyze.
- ✅ **Tooling + docs** (`be6d12d`). `tools/dev-smoke.sh` runs 8 backend assertions for fresh-session verification (verified 8/8 pass). `docs/api.md` is the new engine API contract doc — indexed in `CLAUDE.md` doc graph. Date input maxes at today.

See `WORKLOG.md` for the chronology with verification details per commit.

**Verification gap:** every commit passed `npm run type-check`, `npm run build`, and `tools/dev-smoke.sh` against the live backend. **No UI click-through was performed** — autonomous blocks didn't drive Electron via Playwright. First action on return is a manual smoke (see "What founder should do first when they return" below). If the UI fails, run `bash tools/dev-smoke.sh` first to rule the backend out — that script verifies the entire engine contract end-to-end.

### Recent commits on `main` (newest first)

```
<Watchlist commit lands here>
d736e6e  History page: list + detail of persisted debates
7dbbeff  SQLite session storage + user-facing knowledge base
75d020e  Phase 2.1-light: real-LLM debate via sequential OpenAI calls
be6d12d  Tooling + docs: backend smoke script, engine API contract, date cap
0de893a  Stretch: keyboard shortcuts + Electron app menu
a984179  Stretch: yfinance news headlines in WS stream + UI news card
f3b9543  Phase 4 main: secret storage + Settings UI wiring
331b937  Finalize Handover + WORKLOG for end of autonomous block
de030ee  Phase 5 polish: Stop button, accurate Data status, transcript export
5273904  Phase 5 part 1: yfinance data integration + UI summary strip
e716d86  Phase 4 spike: settings page + nav routing (no keychain yet)
c5815fa  Phase 3: wire desktop renderer to engine sidecar end-to-end
e527632  Pre-reboot wrap-up: refresh Handover + backlog
81f7414  Handover checkpoint at end of Phase 2
a44b935  Phase 2: Python sidecar with FastAPI + stub canned debate
86f0185  Phase 1: scaffold Electron + Vite + React desktop shell
f0125b8  Phase 0: scaffold orchestration docs and gateway probe
```

### Open questions queued for founder (answer when back, then I unblock)

These are decisions I deferred during the autonomous block rather than guess on. None are blocking the existing five-commit run; they're blocking *what comes next*.

1. **First LLM provider for Phase 2.1.** Wiring shape (per-request inject vs. spawn-time env) shouldn't be locked until you pick. I've been assuming OpenAI from the way the Settings tabs are framed — confirm or redirect.
2. **"Test connection" button policy.** I held off because it makes a real provider request on your key, autonomously. OK to add now (with a warning + you trigger explicitly), or hold until after Phase 2.1 lands?
3. **Watchlist + History storage.** `architecture.md` says SQLite. Confirm we're staying that course before I scaffold either page (no localStorage shortcut).
4. **Stockstats / RSI / MACD indicators.** Net-new Python dep on `stockstats`. Adds real indicator math to the technical_analyst stub. OK to install, or hold?
5. **OpenAI OAuth flow.** Phase 4 main only wires API-key paths. Scaffold the OAuth flow now (PKCE + redirect handler in main process), or wait until OpenAI is the locked first provider?
6. **Secrets export / import.** For machine migration: should Settings → About expose a "Export encrypted secrets to file" / "Import on new machine" pair? Defer, or scope now?

### What founder should do first when they return

1. **Pull latest:** `git -C /Users/junaidsiddiqi/Projects/TradingAgents pull` (commits will be on origin/main).
2. **Read `WORKLOG.md`** for the chronological session report and `backlog.md` for the punch-list-style "what's done / what's left."
3. **Smoke-test Phase 3 end-to-end** with the actual UI:
   ```bash
   npm --prefix /Users/junaidsiddiqi/Projects/TradingAgents/desktop run dev
   ```
   Wait for the window to open. Engine status card should flip from "Starting…" to "Running" (green dot) within 2-3s. Click **Analyze** with default ticker `NVDA`. Expect: 17 events stream in over ~7s, ending with a decision card showing **HOLD** at **55%** confidence. Cmd+Q to close when done.
4. **If Phase 3 looks good**, the next discrete chunks are: Phase 4 (settings + keychain — needs founder's API keys to integrate fully), Phase 2.1 (replace stub with real `tradingagents` core — needs decision on first LLM provider), or Phase 5 (yfinance/Alpaca data + paper-trading broker).

### Currently blocked

- (none) — Phase 3 done; Phase 4 spike runway depends on whether the agent reached it before the founder's return (see WORKLOG.md).

### Pending external / deferred

- 🟣 OpenClaw upstream PR adding `client.id: "tradingagentslab"` constant — non-blocking; `"cli"` works today
- 🟣 Massive.com / Polygon-class data provider — deferred until a feature requires it
- 🟣 Distribution + auto-update — Phase 7
- 🟣 No outstanding ClaudeLink threads to Clawless Advisor

## Architectural decisions (locked in)

- **Desktop:** Electron + React + TypeScript (chosen for our own needs, not to inherit Clawless code)
- **UI:** Built from scratch. Independent theme — compatible with Clawless ecosystem aesthetic but no shared CSS or components
- **Engine:** Python 3.13 sidecar wrapping `tradingagents` core, FastAPI on `127.0.0.1` (HTTP + WebSocket)
- **LLM:** BYO keys default. Optional Clawless gateway tap routes through `ws://127.0.0.1:18789` (validated). Anthropic API key only — **no Anthropic OAuth** (TOS-banned).
- **Protocol source of truth:** OpenClaw npm package TypeScript types (MIT, public). Do NOT reverse-engineer Clawless's gateway-client.ts.
- **Data:** yfinance default (free), Alpaca optional (paid, founder's choice). Massive.com deferred.
- **Broker:** Alpaca paper trading default. Live trading gated behind explicit user confirmation per marketing posture.
- **Storage:** SQLite + OS keychain for secrets.
- **Marketing:** "Standalone trading companion for Clawless." Never "extension/plugin/add-on."

## Verified protocol facts (Clawless / OpenClaw gateway)

- URL: `ws://127.0.0.1:18789` · Auth: token in `connect` request params
- Frame envelope: `{type: "req"|"res"|"event", id (string), method, params}` (NOT JSON-RPC)
- Protocol version: running gateway speaks `3`. Docs say `4`. Adapter must negotiate `min/maxProtocol`.
- Schema constraints: `client.id: "cli"` works (custom IDs rejected). `client.mode: "ui"` works (`"operator"` rejected on protocol 3).
- Token grants broad read access (full agent inventory + session history visible). Treat as high-value secret — store via OS keychain only.

See `tools/clawless-probe.mjs` for working reference protocol code.

## Files that matter

| File | Purpose |
|---|---|
| `tools/clawless-probe.mjs` | Gateway connectivity validator (zero-dep Node script, ~110 lines) |
| `docs/architecture.md` | Full design doc |
| `backlog.md` | Phased work items |
| `Handover.md` | This file |
| `CLAUDE.md` | Orchestration rules — read first every session |
| `LICENSE` / `LICENSE-APACHE` / `NOTICE` / `CLA.md` / `CONTRIBUTING.md` | Licensing stack |
| `.env` | Local secrets (gitignored). Contains `CLAWLESS_GATEWAY_*` and LLM provider keys. |

## Conventions / non-obvious things to know

- **Cost discipline:** Founder is on a weekly Opus 4.7 quota. When spawning sub-agents, use Sonnet 4.6 or Haiku 4.5. Reserve Opus for the parent (Claude conversation owner). See `~/.claude/projects/.../memory/feedback_subagent_models.md`.
- **Cross-product channel:** For questions about Clawless desktop / OpenClaw, message `Clawless Advisor` via ClaudeLink (`mcp__claudelink__send`). Do NOT try to read Clawless's repo directly — harness blocks scope escalation outside `~/Projects/TradingAgents/`.
- **No upstream PRs (yet):** Founder explicitly does not plan to upstream changes to TauricResearch. AGPL-3.0 fork is for personal/commercial enhancement under his own terms.
- **Sister-product theming:** Trading desktop must look like a Clawless family member when launched alongside it. Same fonts, same color tokens, same background.

## Where to pick up next session

The full first-moves checklist is above under **"First moves on the next (post-reboot) session"**. Ground truth:

- **Phases 0/1/2 are done.** Don't redo them.
- **Phase 3 is the next deliverable.** Wire the renderer to the engine sidecar so clicking "Analyze NVDA" streams the canned 16-event debate into the UI. Detailed file plan above.
- **Confirm with founder before pushing.** Architecture is settled, but the founder may have new direction after reboot.
- **Read memory before acting:** `~/.claude/projects/-Users-junaidsiddiqi-Projects-TradingAgents/memory/` contains durable context. The `MEMORY.md` index lists everything.
- **Clawless/OpenClaw questions:** message `Clawless Advisor` via ClaudeLink (`mcp__claudelink__send` to role `Clawless Advisor`). Register first as `trading-agents-lab` if not already registered. Frame requests with "no Clawless team work needed" to respect their pre-launch sprint.
