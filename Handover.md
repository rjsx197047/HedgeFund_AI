# TradingAgentsLab — Handover

> **Purpose:** Session-to-session context bridge. If you (Claude or human) are picking this up cold, read this first. Status by phase in [`backlog.md`](backlog.md). Chronological session log in [`WORKLOG.md`](WORKLOG.md). Detailed design in [`docs/architecture.md`](docs/architecture.md). Orchestration rules in [`CLAUDE.md`](CLAUDE.md).

## What this project is

**TradingAgentsLab** — github.com/jaysidd/TradingAgentsLab. AGPL-3.0 fork of Tauric Research's TradingAgents (multi-agent LLM trading research framework). Positioned as the **"standalone trading companion for Clawless"**.

**Connection, not integration.** TradingAgentsLab connects to Clawless the same way it connects to Alpaca or Yahoo Finance — one of N optional connectors. **No code inheritance from Clawless.** No shared CSS, no copied components. Brand-level coherence achieved through independent design.

**Posture:** open-source educational lab + paper trading. Never recommend real-money trading.

**Owner:** Junaid Siddiqi, founder. Treats Claude as principal developer/architect for TradingAgentsLab.

## Where we are right now (as of 2026-05-15 morning — CostGuard polish landed)

### Today's commit (NOT yet pushed — push gate on founder per CLAUDE.md §4)

One commit stacked on local `main`:

```
<next>   feat(cost-guard): Spend pill in StatusStrip + History sort + mid-stream tick
```

What it does:
- 5th pill in StatusStrip ("Spend") shows daily $ vs daily cap with green/amber/red colour states. Polls `/cost-guard/state` every 30s plus a 500ms-delayed re-poll on `tal:session-complete` (closes the race vs engine's finalize_reservation SQLite UPDATE).
- Engine yields a new `cost.usage` event after every `agent.message` carrying running token totals + USD estimate. `free=true` for OAuth subscription + local-LLM runs (both bill at $0 — pill inlines "subscription" / "on-device" instead of a static zero).
- History page gains a sort dropdown (Most recent / Most expensive / Ticker A-Z), choice persisted in localStorage. Per-row cost was already there; this surfaces it sortably.
- 4 new pytests + `docs/api.md` cost.usage shape added.
- 117/117 engine pytests · `dev-smoke.sh` 17/17 · type-check clean.

### Previous day's commits (already pushed 2026-05-14 evening)

```
36fbcb8  docs: 2026-05-14 end-of-day wrap — 8 commits + daily-driver context
25bd7e3  feat(analyze): streaming progress strip — phase chips + agent counter + live clock
ce0207f  fix(dev): dock tooltip + Force Quit + Spotlight read "Trading Agents Lab"
1094865  feat(icon): Trading Agents Lab app icon — amber compass on dark navy
1abf604  fix(local-llm): model picker on Analyze + accept auth_kind=local in cost-guard
206027f  docs: refresh Handover.md + WORKLOG.md for 2026-05-14 overnight session
adc9380  docs(kb): sweep — add pages for local LLM, cost guard, crypto, sentiment
6d514e8  feat: sentiment_analyst grounded in StockTwits + Reddit (port from upstream)
2ab4be1  feat: local LLM support (Ollama / LM Studio / generic OpenAI-compat)
```

Headline arcs:
- **Local LLM support end-to-end** — Ollama / LM Studio auto-detect, Settings UI, model picker on Analyze, $0 CostGuard path. Founder daily-tested with 3 Ollama models.
- **Sentiment_analyst port from upstream** (`0fcf136`) — StockTwits + Reddit pre-fetch grounds the sentiment_analyst in real social data instead of fabricating. Asset-class-aware subreddit routing.
- **App icon end-to-end** — amber compass on navy, distinct from Clawless (green C) so multiple Electron windows in the dock are distinguishable. PNG + multi-resolution `.icns`. Dock tooltip + Force Quit name patched via Info.plist postinstall script.
- **Streaming progress strip** — phase chips + agent counter + live elapsed clock in DebateStream. Founder signed off ("Looks great. I like it.").
- **KB sweep** — 4 new pages (local-llm, cost-guard, crypto-tickers, sentiment).

### Verification at end-of-day

- 113/113 engine pytests pass
- `bash tools/dev-smoke.sh` 17/17
- `npm --prefix desktop run type-check` clean
- Live UI tested: local LLM debate with model dropdown, new icon visible in dock, progress strip animating through all 4 phases
- Dev stack cleanly stopped (no orphan processes at session end)

### Strategic context (for the morning)

- Founder is daily-driving the app for the next ~2-3 weeks while waiting for LLC + Apple Developer Program registration.
- Phase 7b launch prep is correctly gated on that — by the time LLC lands, daily-driving will have surfaced real UX issues to fix first.
- Suggested workflow: founder keeps notes during daily use; triage them in priority order at the end of the cycle.

### First moves when picking back up

1. **Review the 8 commits.** `git log --oneline -8`. Each commit message is self-explanatory; WORKLOG.md 2026-05-14 has the full session report.
2. **Push when ready:** `git push origin main` pushes all 8 at once. Held off per CLAUDE.md §4.
3. **Resume daily-driving** OR pick from the work queue below.

### What's pending (next-session candidates, priority order)

1. **Playwright UI tests** — regression net for daily use; closes the long-carried "UI not click-tested autonomously" gap. Pays back every commit going forward. Suggested next pickup if not daily-driving.
2. **CostGuard 6/6 polish** — Spend pill ✅ shipped 2026-05-15. Remaining: background TTL sweep cleanup of stale reservations (engine side, low priority — TTLs already expire, this just GC's the rows).
3. **Phase 6 Clawless gateway tap** OR **Phase 8 webhooks** — both unblocked; founder's call which feels more valuable.
4. **Phase 7b launch prep** — blocked on LLC + Apple Developer Program (~2-3 weeks).
5. **Streaming progress UX** — ✅ DONE 2026-05-14.

---

## Previous state (as of 2026-05-09 end-of-day — comprehensive update)

### Major shipping milestones since the previous Handover

- ✅ **CostGuard end-to-end** — engine math + 4 HTTP endpoints + renderer modal + Settings tab. TOCTOU-safe, OAuth-aware ($0 path), 3-second anti-tamper override. (`0b3bc20` → `3ccbd05`)
- ✅ **Phase 5b Alpaca data adapter** — auto-routed when keys configured, hard-coded `data.alpaca.markets` (locked positioning safety). Free Basic-tier compatible. (`146933d`)
- ✅ **Crypto support proper path** — `engine/ticker.py` normalization, AlpacaProvider `_crypto_quote_summary` via `/v1beta3/crypto/us/bars`, yfinance crypto branch, asset-class-aware fundamental_analyst prompt, `asset_class` on the wire, Crypto badge on Data card. (`0ff70e3`, `517d99d` for yfinance crypto news fallback)
- ✅ **Compact StatusStrip** at app shell (28px row, visible on every page, replaces 4 bulky cards on Analyze) — frees prime real estate for the debate output. (`fbf226a`)
- ✅ **SEC-aware disclaimer tightening** — three-tier system (footer / inline below decision card / page-level full text). Memory: `project_disclaimer_language.md`. (`b8e395c`)
- ✅ **Locked positioning** — analysis only, no execution code in public repo, ever. Removed Settings → Broker tab. Memory: `project_positioning_analysis_only.md`. (`5d73d7c`)
- ✅ **Strategic posture (this commit)** — free OSS, zero data collection, Clawdemy.org integration, public-repo-never-includes-broker-code, launch-prep gating items. Memory: `project_risk_profile_and_education.md`. README + CLAUDE.md updated.
- ✅ **App display name** "Trading Agents Lab" (3 words) on user-facing surfaces — macOS app menu, window title, header, footer, brand. (`e96bb30`, `b8e395c`)
- ✅ **Engine logging upgrade** — `[ws] OPEN/CLOSE`, `[alpaca]`, `[yfinance]`, `[yfinance fallback]` log lines for live-tail visibility during testing.
- ✅ **Upstream-check tool** — `tools/upstream-check.sh` + weekly cadence rule in CLAUDE.md. We're at upstream/main HEAD (2 commits past v0.2.4 already in tree).
- ✅ **CORS fix** for PUT preflight that was blocking Settings → Cost Guard saves. (`43bd8df`)
- ✅ **Universal green Connected pill** on every SecretRowItem (was only OAuth + yfinance). (`d8fb196`)

### Strategic posture lock-ins (memory; load-bearing)

- `project_positioning_analysis_only.md` — analysis-only, no execution code in public repo, webhooks for external broker handoff
- `project_risk_profile_and_education.md` — free OSS, no monetization, Clawdemy.org case study, zero data collection, launch-prep gating items
- `project_disclaimer_language.md` — three-tier disclaimer copy locked, banned/approved phrasing for AI-washing risk
- `project_alpaca_data_tier.md` — free Basic tier sufficient; never ship features requiring Algo Trader Plus
- `feedback_handle_restarts_yourself.md` — engine kill / dev-server cycle done autonomously; founder has no spare terminals

### Verification at end-of-day

- 100 engine tests pass (cost_guard 36 + cost_guard_api 15 + ticker 17 + alpaca_provider 15 + others)
- `bash tools/dev-smoke.sh` 17/17
- `npm --prefix desktop run type-check` clean
- `npm --prefix desktop run build` clean
- Live UI verified across NVDA, AAPL, CRCL, BAC (equities) + ETH, ADA, DOGE (crypto) end-to-end
- Founder's Alpaca Basic-tier credentials confirmed working for both stocks and crypto endpoints

### Live state at session end

- Dev stack PID 96112 (engine) + Electron + Vite still running for any morning testing
- Kill cleanly with: `pkill -f "engine/.venv/bin/python -m engine"; sleep 1; pkill -TERM -f "TradingAgents.*electron"; sleep 2; pkill -f "TradingAgents.*\.bin/vite"`
- 18 commits ready to push (founder authorized end-of-day push)

### Done — Phase 0 → Phase 3 → Phase 4 → Phase 5p1 → Phase 2.1-light → SQLite + History + Watchlist

**Day 1 (2026-05-07):** Phases 0, 1, 2 + license setup.

**Day 2 (2026-05-08), three autonomous blocks (~13 feature commits, founder away):**

Block 3 (Phase 2.1-light + storage + UI):

- ✅ **Phase 2.1-light: real-LLM debate** (`75d020e`). `engine/live_debate.py` ships a sequential per-agent OpenAI loop with role-specific prompts mirroring upstream. Cost-capped (`max_tokens=400`, 12 agents, gpt-4o-mini default, ~$0.005/session estimate). When `provider_config` is absent in the WS start frame, the path falls through to the canned stub unchanged. Session.complete now carries `live`, `model`, `input_tokens`, `output_tokens`, `estimated_cost_usd` on live runs.
- ✅ **SQLite session storage + parallel KB** (`7dbbeff`). `engine/storage.py` versioned-schema layer at `<repo>/data/sessions.db`, write-on-stream-end, `GET /sessions`, `GET /sessions/{id}`, `DELETE /sessions/{id}`. Best-effort writes never fail the stream. Plus 11-file user-facing knowledge base in `docs/kb/` built by a parallel sub-agent (Sonnet) — getting-started, how-it-works, configuring-llm-providers, data-providers, clawless-connector, reading-the-debate, keyboard-shortcuts, security-and-storage, troubleshooting, faq + index.
- ✅ **History page** (`d736e6e`). List + detail of persisted debates. Race-guarded against rapid row clicks via generation counter. Reuses `DebateStream` for detail view. Copy transcript markdown.
- ✅ **Watchlist page + cleanup** (`4b88894`). SQLite-backed tickers, deep-link to Analyze via `desktop/src/lib/handoff.ts`. Deleted dead `ComingSoon` component now that all four routes have real pages.

Block 2 (Phase 4 main + news + menu + tooling):

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
c2a87c7  Analyze: stack header vertically (always-below provider row)
2cfa560  Codex models: align dropdown with founder's actual picker
abe37f9  Codex: drop max_output_tokens from body
bb2d19a  Codex models: drop codex-tuned variants (Advisor)
4dbbd25  Codex: drop temperature
c81b1d0  Per-provider model picker on Analyze
7986ae2  OAuth: switch default Codex model to gpt-5.4
6b6a187  OAuth: model + dropdown moved to header
9a09d08  Codex adapter: route OAuth via chatgpt.com/backend-api
27f138e  "Run with" provider dropdown + localStorage persistence
bdc1716  UX: green pill for active connections
8053245  Doc sync: backfill ed35277 hash
ed35277  OpenAI OAuth (Codex) via @earendil-works/pi-ai
d8d3585  Doc sync: backfill 8a9526b hash + record Clawless Advisor OAuth deferral
8a9526b  Multi-provider live debate: Anthropic + OpenRouter + Google Gemini
7fcbefa  End-of-block: reconcile architecture.md §7 + refresh founder Q&A inbox
4b88894  Watchlist page: SQLite-backed tickers + deep-link to Analyze
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

### Tomorrow's autonomous block (founder pre-authorized — token budget for the week)

Founder explicitly gave runway for the next session: *"do not worry about tokens, I have enough tokens for this week. You can wrap up cost analysis and budget, do testing, do some testing with playwright."* Queue, in priority order:

1. **CostGuard + budget caps.** Full Clawless Advisor pattern in hand (~600 LoC service shape, TOCTOU reservation pattern, IPC surface, modal override UX, global-not-per-provider budgeting). Extension for stacked daily/weekly/monthly caps + rate-cap dimension for OAuth (since OAuth `usage.cost === 0` means cost-cap is meaningless — rate cap on session count is what matters there). **Founder's directive:** *"When user is using OAuth, you do not want to calculate cost. It's going to be zero. When user is using API, if model selection is via API, then you collect token cost."* — `OpenAICodexAdapter` already returns `(content, in_tokens, out_tokens)` with subscription-routed sessions naturally producing `cost === 0`, so the policy slots in cleanly.
2. **Playwright + Electron testing.** Set up `playwright/test` with Electron driver. Add UI smoke tests covering: provider dropdown switches, model dropdown updates per provider, manual override persists across reloads, OAuth Connect-row state changes correctly, debate stream renders. Closes the "UI not click-tested autonomously" gap that's been a footnote on every commit this run.
3. **JWT plan-tier detection** in `oauth-openai.ts`. Decode the OAuth access JWT at receive time, extract `https://api.openai.com/auth.chatgpt_plan_type`, store alongside credentials. Surface a banner if free-tier (Codex routing is unreliable on free per Clawless Advisor's B34 incident). Small, defensive, ~30 min.
4. **Reviewer pass on the model picker** (commit `c81b1d0`) — skipped in the rush; queue for follow-up cleanup of any caught issues.

### Open questions queued for founder (answer when back, then I unblock)

Decisions I deferred during this run. The three from the previous block that I *did* act on (your blanket authorization covered them) are noted at the bottom. None are blocking what shipped; they're blocking *what comes next*.

1. **Multi-provider order.** Phase 2.1 ships OpenAI only. Anthropic, DeepSeek, OpenRouter wiring lands next — but you pasting a key for one specific provider first lets me ship one targeted commit (with cost table + correct auth shape) instead of a megacommit for all four. Which one do you actually have a key for?
2. **"Test connection" button.** Still holding. Now that real-LLM lands, this is a meaningful UX win (don't burn quota on a typo'd key) — but it still costs ~1 cheap request per test. Add it now with explicit-trigger + warning, or after multi-provider so each provider's test path is wired in one go?
3. **OpenAI OAuth flow.** Same gating as before. Scaffold now or wait until you've used the API key path enough to know if OAuth is worth the complexity?
4. **Secrets export / import.** Speculative without your machine-migration story. Do you want a Settings → About "Export encrypted secrets" / "Import on new machine" pair? If yes, what's the threat model — same machine recovery, or actual cross-machine portability?
5. ~~**Phase 5 part 2: Alpaca data + broker.**~~ **RESOLVED 2026-05-09:** locked positioning (CLAUDE.md §3 + memory `project_positioning_analysis_only.md`) removes the broker work entirely. Replaced by Phase 5b (data-only Alpaca, see backlog) and Phase 8 (webhooks for external broker handoff, see backlog). Alpaca Markets keys now live under Settings → Data Providers, configured for `data.alpaca.markets` only.
6. **Phase 6: Clawless gateway tap.** Probe (`tools/clawless-probe.mjs`) is the working reference. Worth wiring before or after multi-provider? It changes the LLM transport, so logically belongs in the same area as Phase 2.1.

**Acted on with blanket authorization (today's run):**

- All four API-key providers wired (`8a9526b`): OpenAI, Anthropic, OpenRouter, Google Gemini.
- **OpenAI OAuth shipped** (`ed35277` + `9a09d08`) via `@earendil-works/pi-ai`. Subscription-routed via `chatgpt.com/backend-api/codex/responses` (Codex backend), not `/v1/chat/completions`. Verified end-to-end with founder's account: first successful live debate using OAuth + gpt-5.4.
- Per-provider model picker (`c81b1d0` + `2cfa560`): two dropdowns in header, per-(provider, auth) localStorage memory, recommended pre-selection. Codex model list mirrors founder's actual ChatGPT picker.
- DeepSeek removed from Settings.

**Still externally blocked:**

- **Phase 5b (Alpaca data adapter)** — Alpaca Markets keys now stored in Settings → Data Providers; engine adapter for `data.alpaca.markets` is the next discrete unit. Broker work removed per locked positioning 2026-05-09.
- **Phase 6 (Clawless tap)** — could start anytime; deferred behind cost-guard + playwright per founder priority.
- **Subscription-routing verification** — first OAuth debate succeeded; you should check your OpenAI billing dashboard to confirm the run did NOT add to your API tier (i.e., that the Codex/subscription path is actually billing through your ChatGPT plan, not per-token).

### Most natural next priorities (founder picks)

1. **Phase 7b launch-prep** — Terms of Service, Privacy Policy, Cookie Policy, brochure marketing site at tradingagentslab.com, signed DMG distribution. Backlog has the breakdown. Requires founder direction on jurisdiction + scope; engage securities counsel for the disclaimer review before public launch.
2. **KB sweep** — add docs/kb pages for crypto symbols, Alpaca data, Cost Guard. Existing pages still mostly current.
3. **Playwright UI tests** — was originally planned today; deferred for the strategic-posture work that emerged. Closes the "UI not click-tested autonomously" gap that's been carried since the autonomous block days.
4. **Phase 6 Clawless gateway tap** OR **Phase 8 webhooks** — both pending; founder's call which feels more valuable next.
5. **Streaming progress UX** — backlog item from this morning for a phase chip + completion badge in DebateStream (improves the "is it still running?" perception during 60-90s gpt-5.4 debates).

### Domain bookings (founder action)

- `tradingagentslab.com` — defensive must-have, ~$12/yr, canonical
- `tradingagentslab.ai` — brand alignment for AI/LLM positioning, ~$70-90/yr
- Skip `.io` (`.ai` has eclipsed it for AI projects)

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
- **Broker:** ~~Alpaca paper trading default.~~ **REMOVED 2026-05-09 per locked positioning.** TradingAgentsLab is an analysis tool, not an execution platform. External broker integration via outbound webhooks (Phase 8) — users execute on their own authorized brokerage account.
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
