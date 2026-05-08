# TradingAgentsLab — Handover

> **Purpose:** Session-to-session context bridge. If you (Claude or human) are picking this up cold, read this first. Detailed design in [`docs/architecture.md`](docs/architecture.md). Phased work items in [`backlog.md`](backlog.md). Orchestration rules in [`CLAUDE.md`](CLAUDE.md) (template pending from Clawless Advisor).
> **Note:** Initial format will reformat once Clawless `CLAUDE.md` orchestration template arrives.

## What this project is

**TradingAgentsLab** — github.com/jaysidd/TradingAgentsLab. AGPL-3.0 fork of Tauric Research's TradingAgents (multi-agent LLM trading research framework). Positioned as the **"standalone trading companion for Clawless"**.

**Connection, not integration.** TradingAgentsLab connects to Clawless the same way it connects to Alpaca or Yahoo Finance — one of N optional connectors. **No code inheritance from Clawless.** No shared CSS, no copied components. Brand-level coherence achieved through independent design.

**Posture:** open-source educational lab + paper trading. Never recommend real-money trading.

**Owner:** Junaid Siddiqi, founder. Treats Claude as principal developer/architect for TradingAgentsLab.

## Where we are right now (as of 2026-05-07)

### Done

- ✅ Forked upstream into `jaysidd/TradingAgentsLab`
- ✅ Dual-licensed (AGPL-3.0 with Apache 2.0 attribution preserved as `LICENSE-APACHE` + `NOTICE`)
- ✅ Apache-style ICLA (`CLA.md`) granting maintainer dual-licensing rights
- ✅ Git remotes: `origin` → TradingAgentsLab, `upstream` → TauricResearch
- ✅ Pushed to GitHub — repo public, AGPL-3.0 detected
- ✅ Gateway probe (`tools/clawless-probe.mjs`) — multi-client OpenClaw access **verified**: TradingAgentsLab connected as a second client alongside Clawless desktop, ran `connect` + `health`, full agent inventory returned
- ✅ Architecture sketch ratified by founder (Pattern 3 — fully standalone, optional Clawless tap)

### Just shipped (2026-05-07 evening)

- ✅ **Phase 0** — orchestration docs + gateway probe (commit `f0125b8`)
- ✅ **Phase 1** — Electron + Vite + React desktop shell with warm-amber theme on dark base. Founder approved on first look (commit `86f0185`)
- ✅ **Phase 2** — Python 3.13 + FastAPI sidecar with stub canned debate. `/health`, `/analyze`, `/stream` all working with bearer-token auth (commit `a44b935`)

### CHECKPOINT — paused at end of Phase 2 to save founder's weekly Opus quota

Resume Phase 3 in a fresh session. Three phases shipped in one session is good momentum; Phase 3 is a discrete next chunk that doesn't need carry-over context beyond what's in this doc.

### How to resume Phase 3 (next session, fresh Claude)

**1. Verify state cold (~30s):**

```bash
git -C /Users/junaidsiddiqi/Projects/TradingAgents log --oneline -5
# Should show a44b935 Phase 2 at the top.

# Spin up the engine to confirm it still works:
cd /Users/junaidsiddiqi/Projects/TradingAgents
./engine/.venv/bin/python -m engine
# Reads {port, token} from stdout. Ctrl-C to stop.
```

**2. Phase 3 work, in priority order:**

| File to add | What it does |
|---|---|
| `desktop/electron/engine-runner.ts` | Electron main process: spawn `engine/.venv/bin/python -m engine` as a child process. Read first line of stdout, parse `{port, token}`. Emit `engine:ready` IPC event with handshake. Terminate child on app quit. |
| Update `desktop/electron/main.ts` | Call engine-runner on app ready. Wire IPC handler `engine:get-handshake` so renderer can fetch port+token via `tradingAgentsLab.getEngineHandshake()`. |
| Update `desktop/electron/preload.ts` | Expose `getEngineHandshake()` on the `tradingAgentsLab` bridge. |
| `desktop/src/lib/engine-client.ts` | Typed wrapper: `analyze(req)` → POST `/analyze` with bearer; `streamDebate(req, onEvent)` → opens WS `/stream?token=...`, sends start frame, calls `onEvent` for each message. |
| `desktop/src/components/DebateStream.tsx` | New component: shows agent messages as they arrive, grouped by phase, with the agent name + monospace content. Visual style: cards with phase color-coding (amber for analysts, neutral for risk, etc.). |
| Update `desktop/src/pages/Analyze.tsx` | Wire the "Analyze" button to call `streamDebate()`. Render `DebateStream` below the form. Update status cards (Engine: "Running" when handshake succeeds). Disable button while a stream is in flight. |

**3. End-to-end acceptance:** open the desktop app, click "Analyze" with default ticker NVDA, watch the 16 stub events stream into a debate panel over ~7s. Final card shows "HOLD" decision with confidence 0.55.

**4. Phase 3 should NOT yet:**
- Replace the engine stub with real `tradingagents` (that's Phase 2.1)
- Add LLM provider settings (that's Phase 4)
- Add yfinance/Alpaca data (that's Phase 5)
- Add Clawless tap (that's Phase 6)

Stay in scope. The win is "click button → watch debate stream."

### Background processes possibly still running

When this checkpoint was written, the Phase 1 Electron dev environment was running in the background — Vite (port 5173) + Electron main + Electron Helper renderers. Founder may close them with Cmd+Q in the window when done looking. If a fresh session inherits the system, run `pkill -f 'TradingAgents/desktop'` to clean up before re-running `npm --prefix desktop run dev`.

### Currently blocked

- (none) — Phase 3 is fully unblocked.

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
| `CLAUDE.md` | Orchestration rules (pending) |
| `LICENSE` / `LICENSE-APACHE` / `NOTICE` / `CLA.md` / `CONTRIBUTING.md` | Licensing stack |
| `.env` | Local secrets (gitignored). Contains `CLAWLESS_GATEWAY_*` and LLM provider keys. |

## Conventions / non-obvious things to know

- **Cost discipline:** Founder is on a weekly Opus 4.7 quota. When spawning sub-agents, use Sonnet 4.6 or Haiku 4.5. Reserve Opus for the parent (Claude conversation owner). See `~/.claude/projects/.../memory/feedback_subagent_models.md`.
- **Cross-product channel:** For questions about Clawless desktop / OpenClaw, message `Clawless Advisor` via ClaudeLink (`mcp__claudelink__send`). Do NOT try to read Clawless's repo directly — harness blocks scope escalation outside `~/Projects/TradingAgents/`.
- **No upstream PRs (yet):** Founder explicitly does not plan to upstream changes to TauricResearch. AGPL-3.0 fork is for personal/commercial enhancement under his own terms.
- **Sister-product theming:** Trading desktop must look like a Clawless family member when launched alongside it. Same fonts, same color tokens, same background.

## Where to pick up next session

If you're a fresh Claude session reading this cold, the most likely next moves:

1. **Confirm with founder before pushing:** if Phase 0 artifacts haven't been committed/pushed yet, ask before doing so. The architecture is settled but the founder may have new direction.
2. **Phase 1 — desktop scaffolding** is fully unblocked. Scaffold Electron + React + TypeScript app, define independent theme tokens, get an empty branded window opening. No external dependencies on Advisor anymore.
3. **Phase 2 — Python sidecar** is also unblocked. Wrap `tradingagents` core in FastAPI; expose `POST /analyze` and `WS /stream`.
4. **Read memory before acting:** `~/.claude/projects/-Users-junaidsiddiqi-Projects-TradingAgents/memory/` contains durable context — user role, cost discipline, marketing posture, gateway protocol facts. The MEMORY.md index lists everything.
5. **For Clawless/OpenClaw questions:** message `Clawless Advisor` via ClaudeLink (`mcp__claudelink__send` to role `Clawless Advisor`). Register first as `trading-agents-lab` if not already registered. Frame requests with "no Clawless team work needed" to respect their pre-launch sprint.
