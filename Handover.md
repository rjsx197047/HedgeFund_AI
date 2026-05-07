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

### In progress / next up

- 🟡 **Phase 0 wrap-up:** commit + push the probe, architecture doc, backlog, handover, CLAUDE.md. All artifacts ready.
- ✅ **Clawless Advisor replied (2026-05-07):** Founder reframed relationship as "connection, not integration." All inheritance plans dropped. License question dissolved. Most prior blockers cleared.

### Resolved blockers (Advisor reply, 2026-05-07)

- ✅ CLAUDE.md — building our own (Clawless template not portable)
- ✅ Phase 1 theming — pick our own aesthetic
- ✅ Phase 4 settings — build from scratch, no inheritance
- ✅ Multi-client gateway gotchas — captured in `docs/architecture.md` §12

### Currently blocked

- (none)

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
