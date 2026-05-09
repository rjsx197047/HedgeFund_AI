# CLAUDE.md — TradingAgentsLab Orchestration

> **Read this first.** This file is the orchestration contract for any Claude (or human) working in this repo. Other docs are reference; this is the rulebook.
>
> **Doc graph:** [`Handover.md`](Handover.md) (where we are now) · [`backlog.md`](backlog.md) (status by phase) · [`WORKLOG.md`](WORKLOG.md) (chronological session log) · [`docs/architecture.md`](docs/architecture.md) (how it's built) · [`docs/api.md`](docs/api.md) (engine API contract) · [`docs/kb/`](docs/kb/) (user-facing knowledge base)

## 1. Mission

**TradingAgentsLab** is the **standalone trading companion for Clawless** — an open-source educational lab and paper-trading desktop app, AGPL-3.0 licensed, forked from [Tauric Research's TradingAgents](https://github.com/TauricResearch/TradingAgents).

It uses multi-agent LLM analysis (analyst → researcher → trader → risk-manager debate via LangGraph) to produce trade recommendations on user-specified tickers and dates.

## 2. Read order at session start

1. **CLAUDE.md** (this file) — rules
2. **Handover.md** — current state, recent decisions, blockers
3. **backlog.md** — phased work items, status of each
4. **docs/architecture.md** — full design (read sections relevant to current task)
5. **Memory** at `~/.claude/projects/-Users-junaidsiddiqi-Projects-TradingAgents/memory/` — durable context (user preferences, cost discipline, locked decisions). The `MEMORY.md` index lists everything.

## 3. Posture (non-negotiable)

### Marketing / legal

- **Educational lab + paper trading only.** Never recommend real-money trading in code, copy, or chat with the user.
- **Disclaimer language** in any user-facing text: *"For educational research and paper trading. This is not investment advice."*
- **Locked phrasing for Clawless relationship:**
  - ✅ "Standalone trading companion for Clawless"
  - ❌ NOT "Clawless extension / plugin / add-on / integration"

### Code / license

- **Apache 2.0 upstream code stays Apache 2.0** (preserved in `LICENSE-APACHE` + attributed in `NOTICE`).
- **Our additions are AGPL-3.0** (in `LICENSE`).
- **Files modified from upstream** must carry a "modified" notice (Apache 2.0 §4(b)). Use git history as the authoritative record.
- **No Clawless code inheritance.** TradingAgentsLab does not copy CSS, components, or settings code from the Clawless repo. Brand-level coherence yes, code reuse no.
- **Anthropic OAuth is BANNED by Anthropic TOS.** Use API key only for Anthropic. OpenAI may use API key OR OAuth.

### Architectural

- **Connection, not integration:** Clawless is one of N optional connectors (alongside Alpaca, Yahoo Finance, etc.). Treat it that way in code, settings UI, and copy.
- **Protocol source of truth for OpenClaw work:** the public **OpenClaw npm package** TypeScript types (MIT). Don't reverse-engineer Clawless's `gateway-client.ts`.
- **Brand-level coherence:** TradingAgentsLab's UI feels like a Clawless-family product through independent design choices (compatible dark palette, compatible humanist font pairing, complementary accent — *not* the same Clawless cyan).

## 4. Session discipline

### Every session

- **At start:** read this file + Handover.md + check inbox via `mcp__claudelink__read_inbox` (register as `trading-agents-lab` if not already registered).
- **As you work:** update `backlog.md` when items move (pending → in progress → done) and add new items as you discover them.
- **At end:** update `Handover.md` (current state, blockers, where to pick up) AND prepend a fresh entry to `WORKLOG.md` (date header, what shipped today, commit hashes, next-session-opens-with). Future-you (or a fresh Claude) will thank you.

### Commits

- Confirm with founder before pushing to `origin/main`. The repo is public.
- Use HEREDOC commit messages following the pattern in earlier commits.
- Apache 2.0 modification notices belong in `NOTICE` and the `git log`, not in every file's header (one-line "Modified by TradingAgentsLab" comment is sufficient if a file's content was substantially changed).

### Memory

- Save durable, surprising, or non-obvious facts to memory (`~/.claude/projects/.../memory/`).
- Don't memorize anything derivable from the current code or git history.
- Update or remove memory entries when they become stale.

## 5. Sub-agent and cost discipline

**Founder is on a weekly Opus 4.7 quota and burns through it quickly.**

- Default sub-agents to `model: "sonnet"` (Sonnet 4.6) for routine work
- Use `model: "haiku"` (Haiku 4.5) for cheap read-only research (Explore agent, simple lookups)
- Reserve Opus 4.7 for the parent (the conversation owner) and only escalate sub-agents to Opus when the task genuinely needs frontier reasoning
- When parallelizing, default to economical models for the breadth; escalate specific ones if needed

## 6. Cross-product channels

| Topic | Channel |
|---|---|
| Clawless desktop or OpenClaw protocol questions | `mcp__claudelink__send` to role `Clawless Advisor` |
| Anything else in TradingAgentsLab | I am principal developer/architect — make the call |

When messaging Clawless Advisor:
- Frame as "no Clawless team work needed" if applicable (they're in pre-launch sprint)
- Batch related questions into one message
- Advisor replies are not auto-fired; surface comes when founder is at that terminal

## 7. Repository conventions

### Layout

- `tradingagents/` — upstream Python core (Apache 2.0, mostly untouched)
- `tools/` — utilities and probes (e.g., `clawless-probe.mjs`)
- `desktop/` — Electron app (AGPL-3.0, NEW — Phase 1+)
- `engine/` — Python sidecar wrapping `tradingagents/` (AGPL-3.0, NEW — Phase 2+)
- `docs/` — long-form design docs
- Root: `LICENSE`, `LICENSE-APACHE`, `NOTICE`, `CLA.md`, `CONTRIBUTING.md`, `README.md`, `CLAUDE.md`, `Handover.md`, `backlog.md`

### Git remotes

- `origin` → `https://github.com/jaysidd/TradingAgentsLab.git` (push here)
- `upstream` → `https://github.com/TauricResearch/TradingAgents.git` (read-only — pull updates with `git fetch upstream && git merge upstream/main`)

### Secrets

- `.env` is gitignored. All API keys, tokens, and gateway credentials live there or in OS keychain — **never in code, never in chat transcripts**.

## 8. Verified facts

- Multi-client OpenClaw gateway access: **confirmed** 2026-05-07 via `tools/clawless-probe.mjs`
- Gateway URL: `ws://127.0.0.1:18789` · Protocol: 3 · Frame envelope: `{type, id (string), method, params}` · Schema-validated `client.id` and `client.mode`

## 9. Pending decisions (small, deferred)

- OpenClaw upstream PR for `client.id: "tradingagentslab"` (non-blocking, deferred)
- Massive.com / Polygon-class data provider (deferred — Alpaca sufficient for v1)
- Distribution: direct download / Mac App Store / signed installer (defer to Phase 7)
- Auto-update mechanism (defer to Phase 7)

## 10. Questions to escalate to the founder, not decide alone

- Real-money trading enablement in distribution builds
- Public marketing copy and positioning
- Commercial licensing offers (CLA preserves the right; founder makes the call)
- Distribution and pricing
- Coordinated OpenClaw version bumps (cross-product impact)
- Anything that touches Clawless-team work

Everything else: act as principal developer/architect.
