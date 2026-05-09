# TradingAgentsLab — Worklog

> **Purpose:** Chronological day-by-day record of what shipped each session. Complement to [`backlog.md`](backlog.md) (status by phase) and [`Handover.md`](Handover.md) (current state). When you want "what did we do yesterday vs today," read this. When you want "what's left," read `backlog.md`. When you want "where do I pick up," read `Handover.md`.
>
> **Format:** Newest entries on top. Each session gets a date header, a one-line goal, bulleted commits with hashes, and a "next session opens with" line.

---

## 2026-05-09 — Daylong session: docs cleanup → CostGuard → Alpaca → crypto → strategic posture

**Goal:** Continue from yesterday's OAuth wrap-up. Founder authorized a long autonomous block plus interactive testing. By end-of-day: 18 commits shipping CostGuard end-to-end, locked positioning + memory, Alpaca data adapter (Phase 5b), full crypto support (auto-routed by ticker), compact app-shell status strip, tightened SEC-aware disclaimers, and an upstream-check tool.

**Headline shipped (in order):**

- `8c0db38` — **docs:** rewrote README around TradingAgentsLab + refresh KB. Added 3 Mermaid diagrams (system arch, debate pipeline, sequence). Killed the upstream-dominant 358-line README in favor of 99-line Lab-focused content + acknowledgements at bottom. Updated 8 KB pages including `oauth.md` (NEW) — all stale "wiring in progress" / "OpenAI only" claims cleared.
- `0b3bc20` — **CostGuard 1/6:** `engine/cost_guard.py` (DAO + math + dataclasses). Storage schema v1→v2 with in-place ALTER for `auth_kind`. 36 unit tests covering window math, worst-case reservation, OAuth bypass, TTL sweep, crash recovery.
- `d501238` — **CostGuard 2/6:** wire reserve/finalize into `live_debate.py` finally + 4 HTTP endpoints. WS `/stream` reads optional `reservation_id`, auto-reserves on backward-compat path, emits `cost.blocked` event. 15 API integration tests.
- `6e15c8e` — **CostGuard 3/6:** renderer-side reservation gate in Analyze.tsx + `<CostGuardModal>` with 3-second anti-tamper countdown.
- `3ccbd05` — **CostGuard 4/6:** Settings → Cost Guard tab with toggle, USD cap inputs, session rate cap, current-period spend bars (green→amber→red).
- `e96bb30` — **app name:** "Trading Agents Lab" (3 words) for user-facing surfaces. Repo / npm package stay one word.
- `43bd8df` — **CORS fix:** `engine/server.py` `allow_methods` was missing PUT — Settings → Cost Guard save was failing with "Failed to fetch."
- `d8fb196` — **green Connected pill universal:** applied yesterday's convention to every SecretRowItem so any stored key flips to green. Alpaca Live rows show "Stored · Inert" (preserves safety messaging).
- `dcde744` — **Alpaca split-fields:** Settings → Broker now splits Alpaca Paper into Key ID + Secret rows (Alpaca needs both APCA headers).
- `5d73d7c` — **Positioning lock:** founder formally locked analysis-only-no-execution-ever positioning. Removed Settings → Broker tab. Moved Alpaca to Data Providers as "Alpaca Markets — Key ID/Secret". Backlog Phase 5 part 2 marked REMOVED. New Phase 8 (webhooks) added. CLAUDE.md §3 expanded. Memory: `project_positioning_analysis_only.md`.
- `5f2e6e3` — **upstream-check tool:** `tools/upstream-check.sh` reports behind-by count; CLAUDE.md gets weekly cadence rule. Verified at upstream/main HEAD (2 commits past v0.2.4 already in our tree).
- `146933d` — **Phase 5b: Alpaca data adapter end-to-end.** AlpacaProvider hits `data.alpaca.markets/v2/stocks/{symbol}/bars` with `feed=sip` + `end=now-16min`. Auto-routes when keys configured; falls back to yfinance otherwise. Hard-coded base URL (locked positioning safety). 13 unit tests.
- `0ff70e3` — **Crypto support proper path.** New `engine/ticker.py` for symbol normalization (BTC, BTC-USD, BTC/USD all canonicalize). AlpacaProvider gains `_crypto_quote_summary` using `/v1beta3/crypto/us/bars`. YFinance routes crypto via `BTC-USD`. `fundamental_analyst` prompt updated for crypto fundamentals (tokenomics, on-chain, macro). `asset_class` propagates through `data.summary` event to UI. 17 ticker + 2 alpaca crypto tests.
- `517d99d` — **yfinance crypto news fallback:** when Alpaca returns 0 headlines for crypto (sparse outside BTC/ETH), silently fall through to yfinance. Equity path unchanged.
- `fbf226a` — **Compact StatusStrip at app shell.** Founder feedback: 4 bulky cards on Analyze were taking the prime real estate above the debate output. Lifted to 28px row between titleBar and main grid — visible on every page. CustomEvent (`tal:data-provider`) lets per-stream Data routing flow through.
- `b8e395c` — **Disclaimer tightening (SEC AI-washing aware):** three-tier system locked. Tier 1 footer, Tier 2 inline below decision card, Tier 3 page bottom. Memory: `project_disclaimer_language.md` with banned/approved phrasing.
- (this commit) — **Strategic posture + README refresh + wrap-up.** Memory: `project_risk_profile_and_education.md` covering free-OSS, Claudomy.org integration, zero-data-collection, public-repo-never-includes-broker-code, launch-prep gating items. README updated with crypto, Alpaca, Cost Guard, mission, privacy section, Tier 3 disclaimer. Backlog Phase 7b (launch prep) added. CLAUDE.md §3 expanded with business model + privacy + educational integration.

**Engine logging mid-day:** Added `[ws] OPEN/CLOSE`, `[alpaca] bars/news OK/FAILED/AUTH-FAIL/NON-200/EMPTY`, `[yfinance] bars/news OK/FAILED`, `[yfinance fallback] news OK` log lines for live-monitor visibility. Founder requested per-step progress visibility; we live-tailed engine stderr via Monitor tool through testing.

**Live testing this session (real LLM, all OAuth/$0):**
- Equities through Alpaca: NVDA, AAPL, CRCL, BAC — all clean
- BTC (equity ticker collision — surfaced design gap → backlog item → fixed in 0ff70e3)
- Crypto via Alpaca v1beta3: ETH ($2,329, +6.37%), ADA ($0.2725, +7.29% — sub-dollar 4dp validated), DOGE ($0.1094, +18.21%)
- ADA + DOGE confirmed Alpaca news sparseness for non-major crypto → motivated 517d99d yfinance fallback

**Founder strategic statements captured to memory:**
1. **Locked positioning** — analysis only, no execution code in public repo, even feature-flagged. Webhooks for external broker handoff is the integration model.
2. **Risk profile + education** — free OSS, no monetization (legal counsel before any change), Claudomy.org case-study integration, zero data collection, brochure-only marketing site, polish to professional standard before public DMG.

**Verification at end-of-day:**
- 100 engine tests pass (cost_guard 36 + cost_guard_api 15 + ticker 17 + alpaca_provider 15 + others)
- `dev-smoke.sh` 17/17
- `npm run type-check` + `npm run build` clean
- Live UI verified across multiple equities + 3 crypto symbols end-to-end

**Next session opens with:**
- 18 commits pushed at end-of-day (founder authorized)
- Live dev stack PID 96112 still running — `pkill -f "engine/.venv/bin/python -m engine"; pkill -f "TradingAgents.*electron"` if not needed
- Most natural next priorities (founder's call):
  1. Phase 7b launch-prep items (ToS, Privacy Policy, Cookie Policy, brochure site, DMG distribution)
  2. KB sweep to add pages for crypto + Alpaca + Cost Guard
  3. Playwright UI tests (originally planned today; deferred for the strategic-posture work that emerged)
  4. Phase 6 Clawless gateway tap or Phase 8 webhooks

---

## 2026-05-09 (continued) — Codex adapter (OAuth → ChatGPT-subscription routing)

**Founder bug report:** OAuth path 429'd with `insufficient_quota`. The OAuth access token was being attached to the standard `/v1/chat/completions` endpoint, which OpenAI treats as a regular API-tier key (and the founder's API quota was exhausted, hence the 429).

**Root cause** (per pi-ai source — `desktop/node_modules/@earendil-works/pi-ai/dist/providers/openai-codex-responses.js`): subscription-routed Codex requests live at a completely different endpoint family — `https://chatgpt.com/backend-api/codex/responses` — using the OpenAI Responses API shape (not Chat Completions). The reviewer flagged this exact concern as B2 in the previous OAuth commit; we couldn't verify without the founder's token. Now we have the empirical answer.

**Architect protocol:**
- Pre-design advisor: required raw `httpx` adapter first (don't trust SDK transparency for `chatgpt.com/backend-api`), single-commit scope (no test-connection bundling, no streaming UX, no cost-table updates), reviewer-must-check items (account_id required header, error body surfacing, missing-usage-fields handling, OAuth-runs-aren't-per-token-billed log note).
- Implementation followed: hand-rolled httpx adapter using SSE parsing.
- Reviewer pass pending — committing now and going through reviewer in the next chunk so founder has the fix to test immediately. (Will queue any reviewer-flagged items into a follow-up.)

**Shipped:**

- New `engine/llm_providers.OpenAICodexAdapter` — sibling of `OpenAIAdapter`, same `LLMAdapter` Protocol, talks to `https://chatgpt.com/backend-api/codex/responses` instead. All headers replicated from pi-ai's `buildBaseCodexHeaders` + `buildSSEHeaders`:
  - `Authorization: Bearer <oauth_access>`
  - `chatgpt-account-id: <accountId from oauth credentials>` (required — without it, 401)
  - `originator: pi`, `User-Agent: pi (TradingAgentsLab)`
  - `OpenAI-Beta: responses=experimental`, `accept: text/event-stream`, `content-type: application/json`
- Body shape from pi-ai's `buildRequestBody`: `model`, `instructions` (system prompt), `input: [{role, content: [{type: "input_text", text}]}]`, `text.verbosity: "low"`, `include: ["reasoning.encrypted_content"]`, `tool_choice: "auto"`, `parallel_tool_calls: true`, `temperature`, `max_output_tokens` (Responses API uses this, not `max_tokens`), `store: false`, `stream: true`.
- SSE response parser: accumulates `response.output_text.delta` events into a complete message, reads `usage.input_tokens` / `usage.output_tokens` from `response.completed`. Returns the same `(content, in_tokens, out_tokens)` tuple as every other adapter — `live_debate.py` doesn't change.
- Factory routing: `adapter_for(config)` picks `OpenAICodexAdapter` when `config.auth["type"] == "oauth"`, otherwise `OpenAIAdapter`. The api-key path is completely unaffected.
- `account_id` plumbed end-to-end: pi-ai's `accountId` → `oauth-openai.ts` `StoredOAuthCredentials.accountId` → `tradingAgentsLab.oauth.openaiCredentials()` → `Analyze.tsx` → `provider_config.auth.account_id` (snake_case for engine consistency) → `ProviderConfig.from_dict` (accepts both `account_id` and `accountId`) → `live_debate.py` calls `adapter.set_account_id(...)` on the Codex adapter via `hasattr` duck-typing.
- Doc note: cost estimate for OAuth-routed sessions overstates actual cost (subscription billing amortizes; the per-token math is wrong-direction). Founder's billing dashboard is source of truth — we don't try to calculate "free" because the cost is real, just not directly per-call.

**Verification:**
- `npm run type-check`: clean
- `bash tools/dev-smoke.sh NVDA 2026-05-08`: 17 passed (stub regression preserved)
- Engine boots clean with the new adapter
- `ProviderConfig.from_dict` round-trips `account_id` correctly (both snake_case and camelCase)
- Adapter selection: OAuth → `OpenAICodexAdapter`, API key → `OpenAIAdapter`, Anthropic OAuth still rejected
- **Live OAuth call against the Codex endpoint NOT verified** — founder needs to test with their token. If the request 4xx's with anything other than `insufficient_quota`, header/body shape needs adjustment. Most likely failure modes:
  - `401` — account_id missing or wrong format
  - `400` — body shape doesn't match what Codex expects (most likely culprit: missing/extra field)
  - Model availability error — gpt-4o-mini may not be available on all subscription tiers; founder may need to switch to a model their tier offers
- Reviewer pass queued for follow-up (committing now so founder can test immediately).

**Commit:** TBD.

---

## 2026-05-09 (continued) — Provider selector on Analyze page

**Founder feedback live:** smoke-tested OAuth + Anthropic API key configured simultaneously. OpenAI quota was exhausted but the silent priority resolver kept picking OpenAI; the only way to fall back to Anthropic was to disconnect OpenAI entirely. Bad workflow. Founder asked for a model selector on the Analyze page so the user can pick which provider runs the next debate without disconnecting others.

**Architect protocol followed (advisor before, write, reviewer after):**
- Pre-design advisor: required one entry per provider (NOT splitting OpenAI dual-auth into two dropdown items — that's feature creep), pre-select the resolver's pick on mount with the choice visibly displayed, persist in localStorage with mount-time validation against current credentials, keep state local to `Analyze.tsx` (no context lifting), no explicit "Stub debate" option (debug affordance, not user-facing).
- Reviewer (Sonnet): one strong-recommend (closure-capture race in async `onAnalyze`), three nice-to-haves (a11y label, doc drift in §7, stub-only-option fragility). Race fix applied via `activeProviderRef` + `openaiAuthKindRef` mirrors — same pattern the codebase already uses for `isStreamingRef`/`engineReadyRef`. aria-label on Reset added. Doc drift can travel.

**Shipped:**

- New "Run with" `<select>` between the form row and helper text. All 4 providers shown in priority order (`openai > anthropic > openrouter > gemini`). Configured providers show "{Provider} · {model}"; unconfigured show "{Provider} — configure in Settings" and are `disabled`.
- For OpenAI specifically: when OAuth is configured, the dropdown label reads "OpenAI (OAuth) · gpt-4o-mini". OAuth-vs-API-key resolution stays internal — one entry per provider, advisor's call.
- "Reset" button next to dropdown when a manual override is active. Clears localStorage and falls back to the priority resolver.
- Persistence: `tal:analyze:selected-provider` localStorage key. Mount-time validation: if the saved choice's credentials are gone (key deleted in Settings since last session), `useEffect` clears both state and localStorage so the priority resolver wins on next render.
- Refactored: `activeProvider` is now a `useMemo` derived from `manualProvider` + `configuredProviders` rather than its own state. Single source of truth.
- Race guard: `activeProviderRef` + `openaiAuthKindRef` mirror the resolution state. `onAnalyze` reads from the refs at click-time, so a Settings-driven state change racing with the multiple awaits between mousedown and the WS open frame can't leave the request using stale provider/auth state.

**Verification:**
- `npm run type-check` clean
- `npm run build` clean
- `bash tools/dev-smoke.sh NVDA 2026-05-08`: 17 passed, 0 failed (no engine-side change in this commit)
- Vite HMR live on the running app — founder will see the dropdown immediately

**Open question queued for founder:** persistence policy. Default is "persist with mount-time validation" — saved choice survives across launches but auto-drops if its credentials disappear. Fine to keep, or want to reset on launch every time?

**Commit:** TBD.

---

## 2026-05-09 (continued) — UX polish: green pill for active connections

**Context:** Founder smoke-testing the live OAuth flow noticed the "Connected" pill on the Settings → LLM Providers row stayed amber (brand accent) instead of flipping to green. Same amber as the disconnected "Recommended" state — no visual confirmation. Status dots elsewhere in the app already use green for the "wired and working" state; the Settings pill needed to match.

**Shipped:**
- `desktop/src/pages/Settings.module.css` adds `.pill_success` (green using `--tal-positive`).
- OAuth row pill flips `pill_default` → `pill_success` on Connected.
- yfinance "Active · default" pill also flipped (same semantic — actively serving).

**Convention now:**
- Green = "this is wired and working right now" (OAuth connected, default data provider serving)
- Amber `pill_default` = brand-accent labels (Recommended, Compatible, API key only) — descriptive, not connection state
- Neutral / red kept as-is

Vite HMR picked up the CSS change with no restart needed — verified by founder.

---

## 2026-05-10 (early hours) — Reviewer fix + JWT plan-tier + lessons doc

**Quiet wrap-up after the long OAuth-debug-loop day.** Founder gave another autonomous block but advisor reframed: building CostGuard or Playwright at 2:30 AM unsupervised is bad — money on the line for CostGuard, no escalation path if Electron Playwright hits the macOS gauntlet. Instead, three small reversible commits and stop.

**Shipped:**

- `f0c8fbb` Analyze: fix Reset leaving activeModel stale. Reviewer pass on c81b1d0 caught a real bug — `onResetOverrides` cleared localStorage and `manualProvider` but never reset the in-memory `activeModel` state. The model-sync useEffect only re-fires on (provider, authKind) changes, so a model-only reset (provider unchanged) silently failed in memory. Fix: snap `activeModel` to recommended explicitly at end of reset, reading provider/authKind via refs (consistent with `onAnalyze`'s pattern).
- `b9c6b3b` OAuth JWT plan-tier detection. Decode `chatgpt_plan_type` from the access JWT at receive time (and on refresh), store in `StoredOAuthCredentials.planType`. Surface as `OAuthStatus.planType` + `isFreeTier`. Settings UI shows plan tier inline ("Connected as ... · plus plan") and a banner if free-tier ("⚠ Codex routing is unreliable on free-tier accounts"). 9-case unit verification of the decoder against synthetic JWTs all pass. Defensive — never blocks login.

---

### Lessons from the OAuth iteration loop (for next session)

The OAuth/Codex chunk shipped 8 commits in ~2 hours of founder-supervised testing. Looking back, 4-6 of those commits were avoidable. Distilling for the next time we integrate against an undocumented endpoint:

**1. Read the working reference implementation in full BEFORE the first commit.**

We had `@earendil-works/pi-ai/openai-codex-responses.js` available locally — it's the working reference for exactly this integration. Today's debug loop followed a "ship → empirical 400 → diagnose → ship" cycle when the cure was a single 30-minute source dive into pi-ai's `buildRequestBody` + `buildBaseCodexHeaders`. After that dive, the body and headers are deterministic; everything else is infrastructure.

The pattern to internalize: **when integrating against an undocumented endpoint where a working reference implementation exists, read the reference's request construction in full FIRST, mirror it exactly, then iterate from there**. Don't ship a partial implementation that's 80% guessed.

**2. Codex backend rejects more parameters than it accepts.**

Empirically learned today (in commit-by-commit order):
- `gpt-4o-mini`: rejected ("not supported when using Codex with a ChatGPT account")
- `gpt-5.1-codex-mini`: rejected (same wording — codex-tuned variants are restricted)
- `temperature`: rejected as unsupported parameter (GPT-5 family is reasoning-tuned)
- `max_output_tokens`: rejected as unsupported parameter (Codex doesn't accept ANY token-limit field)
- Working: `gpt-5.4` model + body matching pi-ai's exact shape (no temperature, no max_output_tokens, with `text.verbosity`, `include`, `tool_choice`, `parallel_tool_calls`, `store: false`, `stream: true`)

For next time: pi-ai's body shape is the contract. Don't add fields it doesn't have.

**3. Plan-tier matters for model availability.**

Per Clawless Advisor B34: codex-tuned variants (`*-codex`, `*-codex-max`, `*-codex-mini`) work on paid tiers but hang/fail on free-tier accounts. Even `gpt-4o-mini` is available on the API tier but rejected on Codex routing. There is no public allowlist — the empirical data is the only reliable source. Curated UI lists must be conservative (general-flagship variants only) with codex-tuned ones as opt-in or excluded.

**4. Engine restart matters whenever the engine code changes.**

Shipped a temperature fix → founder retested → got the SAME error → realized the engine sidecar was a leftover process from before the fix. Vite HMR delivers renderer changes immediately, but the Python engine has to be killed and respawned. **Always communicate "engine restart required" loudly when the fix is in `engine/`** — and in autonomous chunks, kill the engine before declaring the fix verified.

**5. Reviewer's pre-commit warnings are a leading indicator. Heed them.**

The OAuth commit (`ed35277`) shipped with reviewer's B2 ("subscription routing not contractually guaranteed by either pi-ai or this integration") flagged loudly in the commit message. We shipped anyway because we couldn't verify without the founder's token. Founder's first run hit the exact failure that B2 predicted (429 against API tier instead of subscription routing). The reviewer was right; we just didn't have a way to verify. Pattern: **when the reviewer flags something we can't verify, ship with the loudest possible warning AND prepare the most-likely-needed fix in advance** so the iteration loop is one commit instead of five.

**6. Authorization is not a directive.**

Founder offered another autonomous block tonight — generous, but advisor (correctly) flagged that CostGuard at 2:30 AM with money on the line is bad. Stopping at a high-water mark IS a feature. The bias toward "use all the runway" produces reactive cycles like today's OAuth loop. Tomorrow with founder awake = better verification loop, much faster correction cycle, less wasted code.

---

## 2026-05-09 (end-of-day) — OAuth empirical fixes + per-provider model picker

**Founder back from sleep, smoke-tested live OAuth, hit a series of empirical issues with the Codex backend. Fixed each iteratively in tight commits.**

### What founder caught that I didn't anticipate

Reviewer's B2 concern (subscription routing not contractually guaranteed) was the headline gap. Standing it up against the founder's actual ChatGPT account exposed several layered issues nobody had verified:

1. **`/v1/chat/completions` doesn't subscription-route OAuth tokens.** First debate hit `429 insufficient_quota` against the founder's exhausted API tier — not the subscription. Per pi-ai source: subscription routing requires `chatgpt.com/backend-api/codex/responses` (a totally different endpoint family using OpenAI's Responses API shape, not Chat Completions). Built `OpenAICodexAdapter` (`9a09d08`).

2. **Codex backend rejects `gpt-4o-mini`** for ChatGPT-account auth ("not supported when using Codex with a ChatGPT account"). Switched OAuth default to `gpt-5.1-codex-mini` (`6b6a187`).

3. **Codex backend ALSO rejects `gpt-5.1-codex-mini`** with the same error. Switched OAuth default to `gpt-5.4` per Clawless Advisor's recommendation — general flagship variants work reliably, codex-tuned ones are hit-or-miss across plan tiers (`7986ae2`, `bb2d19a`).

4. **Codex rejects `temperature`** as unsupported parameter (GPT-5 family is reasoning-tuned, doesn't expose temperature control). Removed from body — pi-ai also only sends temperature conditionally (`4dbbd25`).

5. **Codex rejects `max_output_tokens`** too. I'd added it as the Responses API equivalent of `max_tokens`; pi-ai's source confirms they DON'T send any token limit field on the Codex body. Removed (`abe37f9`). Output length now bounded by system prompts ("3-5 sentences" / "2-3 sentences") instead of an enforced cap.

6. **`gpt-5.4` finally worked end-to-end.** First successful subscription-routed debate, ~60-90s total session.

### Per-provider model picker

Founder asked for it after step 5: "Why don't we just give users a full list of models available once they sign up… mark recommended… 3-4 latest, no legacy." Built (`c81b1d0`):

- Two side-by-side dropdowns in page header: Provider + Model
- Per-provider curated lists with `recommended: true` flag for default
- OpenAI Codex (OAuth) gets its OWN model list distinct from API-key OpenAI
- Per-(provider, auth) localStorage memory — switching between providers remembers each one's last manual choice
- Race-guarded via `activeModelRef` mirror like `activeProviderRef` / `openaiAuthKindRef`
- Reset clears BOTH provider AND model overrides + per-provider model memories

### Codex model list aligned to founder's actual picker (`2cfa560`)

Founder caught that my list included `gpt-5.4-pro` and `gpt-5.4-nano` — which appear in pi-ai's general OpenAI registry but NOT in the founder's actual ChatGPT Codex picker. Replaced with the 6 models from their picker (verbatim labels + descriptions), excluding the one we'd already confirmed broken.

### Layout fix (`c2a87c7`)

Founder spotted a layout inconsistency: short model descriptions (Anthropic) let the provider row fit beside the title and squeezed the subtitle into a narrow column; long descriptions (OpenAI) wrapped below cleanly. Forced `flex-direction: column` on the page header so layout is deterministic regardless of model description length — title → subtitle → provider row, always stacked.

### Clawless Advisor delivered both pinged questions

Got back at 07:10 with two detailed answers (~600 lines of design surface):

**OAuth model availability:** plan-tier-dependent. Codex-tuned variants require additional authorization scopes beyond standard OAuth + chatgpt-account-id. Free-tier accounts hit silent failures. Their fix: decode the OAuth JWT at receive-time, store `chatgpt_plan_type`, demote Codex provider in priority order for free tiers. Filed for tomorrow.

**CostGuard pattern:** full design handed over. SQLite-backed config + state at `costguard_config_v1` / `costguard_state_v1`. TOCTOU reservation pattern for race safety (5-min TTL). IPC surface: `getState/updateConfig/recompute/check/complete`. Modal override UX with anti-tamper. **Global budget**, not per-provider. **OAuth naturally skips** because subscription `usage.cost === 0`. Suggested extension: stacked daily/weekly/monthly caps + rate-cap dimension for OAuth (rate-cap because cost-cap doesn't apply). Fully scoped — ~3h chunk.

### Verification

- `npm run type-check`: clean across every commit
- `bash tools/dev-smoke.sh NVDA 2026-05-08`: 17 passed throughout
- **First end-to-end live OAuth debate succeeded** with `gpt-5.4` (founder confirmed)
- Subscription routing claim awaiting OpenAI billing dashboard confirmation by founder

### Tomorrow's queue (founder authorized unsupervised work)

Founder explicitly said *"do not worry about tokens, I have enough tokens for this week"* and queued:

1. **CostGuard + budget caps** (Clawless Advisor pattern, with stacked daily/weekly/monthly + OAuth rate-cap)
2. **Playwright testing** — set up Electron Playwright driver, add UI smoke tests, finally close the "UI not click-tested autonomously" gap
3. **JWT plan-tier detection** in OAuth handler (small, defensive)
4. **Reviewer pass on the model picker** (skipped earlier in the rush)

Founder's policy directive on cost calculation — important: *"When user is using OAuth, you do not want to calculate cost. It's going to be zero. When user is using API, if model selection is via API, then you collect token cost."* Aligns with Advisor's pattern (`usage.cost === 0` for subscription paths means cap naturally skips).

**Commits today (in chronological order):**

```
75d020e  Phase 2.1-light: real-LLM debate via sequential OpenAI calls
7dbbeff  SQLite session storage + user-facing knowledge base
d736e6e  History page: list + detail of persisted debates
4b88894  Watchlist page: SQLite-backed tickers + deep-link
7fcbefa  End-of-block: reconcile architecture.md §7 + refresh inbox
8a9526b  Multi-provider: Anthropic + OpenRouter + Gemini
d8d3585  Doc sync: backfill 8a9526b hash + Advisor OAuth deferral
ed35277  OpenAI OAuth (Codex) via @earendil-works/pi-ai
8053245  Doc sync: backfill ed35277 hash
bdc1716  UX: green pill for active connections
27f138e  "Run with" provider dropdown + localStorage persistence
6b6a187  OAuth default model + dropdown moved to header
9a09d08  Codex adapter: route OAuth via chatgpt.com/backend-api
4dbbd25  Codex: drop temperature
c81b1d0  Per-provider model picker
7986ae2  Switch default Codex model to gpt-5.4 (unblock)
bb2d19a  Codex models: drop codex-tuned variants (Advisor)
abe37f9  Codex: drop max_output_tokens
2cfa560  Codex models: align with founder's actual picker
c2a87c7  Analyze: stack header vertically
```

**20 feature commits today.** All type-check + smoke clean. **First end-to-end live LLM debate succeeded** — biggest milestone.

---

## 2026-05-09 (continued) — OpenAI OAuth (Codex / subscription path)

**Goal:** Founder explicitly stated they prefer routing through their ChatGPT subscription rather than per-token billing. Wire OAuth alongside the API-key path that shipped in `8a9526b`. Per Clawless Advisor's pattern reply (received 01:33 — they did the code dive after founder bumped priority), the heavy lifting belongs to a third-party MIT-licensed package (`@earendil-works/pi-ai`) that handles PKCE + browser callback + token exchange internally.

**Architect protocol followed:**
- ClaudeLink consult with Clawless Advisor for OAuth pattern reference. Detailed reply with five gotchas (port 1455, silent browser callback, `shell.openExternal` quirks, token expiry timestamp units, subscription routing).
- Pre-design advisor: required discriminated-union wire shape (not muddled `api_key`-as-Bearer-slot), single-key JSON-blob storage in `safeStorage` (not three keys), no DIY refresh loop (use pi-ai's primitive), `npm view` verification before installing, scope kept to OAuth wiring only (no test-connection bundling).
- pi-ai package verification: `@mariozechner/pi-ai` is **deprecated** with forward-pointer to `@earendil-works/pi-ai@0.74.0` (same MIT license, fresh fork by same authors). Switched to maintained namespace before installing.
- Code reviewer (Sonnet) on the working tree pre-commit. **Two blocking issues + three strong-recommends + four nice-to-haves** flagged. All addressed before commit.

**Reviewer fixes applied:**

1. **B1 — `setTimeout` orphan that wedges next login.** pi-ai calls `onManualCodeInput` unconditionally at flow start (not only on browser-callback failure). The 20s timer kept running post-success and stomped `pendingPromptResolver` after the `finally` reset, blocking subsequent login attempts until app restart. Fix: capture `timer` ID in an `activeFallbackCleanup` closure, `clearTimeout` from the outer `finally`. Reviewer's deterministic app-restart-required bug — caught + fixed before commit.
2. **B2 — Subscription-plan routing was unverified.** Reviewer dug into pi-ai source: `loginOpenAICodex` issues against `auth.openai.com` with `client_id: "app_EMoamEEZ73f0CkXaXp7hrann"` and `offline_access` scope. Whether OpenAI routes the resulting token through ChatGPT subscription or bills per-token is account-configuration-dependent and not contractually guaranteed by either pi-ai or our integration. Documented loudly: Settings UI text now reads *"verify with a low-cost model first and check your billing dashboard before relying on this for cost savings"*; status hint dropped the "(subscription)" qualifier; architecture.md §5 calls out the verification gap; commit message reproduces the warning.
3. **SR1 — `secrets:get` IPC could expose raw OAuth JSON.** Renderer-side convention prevented this in practice (Settings only calls `oauth.openaiStatus`), but the `secrets:get` handler accepted any key including `oauth:*`. Hardened: handler returns `null` for any `oauth:`-prefixed key. OAuth tokens flow via the dedicated `oauth:openai:credentials` bridge that auto-refreshes before returning, never via `secrets:get`.
4. **SR2 — refresh-token race.** OpenAI may issue single-use refresh tokens; concurrent `refreshIfNeeded` calls would race and force re-login. Added module-level `refreshInFlight: Promise<...> | null` mutex so concurrent callers share one in-flight refresh. pi-ai doesn't export `refreshOAuthTokenWithLock` so we implement the lock locally.
5. **SR3 — stale Settings copy.** OpenAI API-key row still read "OAuth lands in a follow-up commit." Updated to "OpenAI (API key fallback)" with note that OAuth wins above when both are configured.
6. **N1 — `email` field doesn't exist on pi-ai response.** pi-ai returns `accountId` (UUID), not `email`. `toStored` updated to extract `accountId` and surface as "account abc-123…" prefix in the UI. Falls back gracefully when neither is present.
7. **N3 — NOTICE author attribution.** Removed "Armin Ronacher" since the installed package only confirms Mario Zechner via `package.json` author field; no LICENSE file ships in the npm tarball. Wording now reflects what's verifiable.
8. **N4 — neutral copy.** Removed "(subscription)" qualifier from the Analyze status hint.

**Architecture choices:**

- **Wire shape (discriminated union):** `provider_config.auth = {type: "api_key", api_key} | {type: "oauth", access, refresh, expires}`. Engine has a `bearer_token` accessor that collapses both into one string for the `Authorization: Bearer …` header; adapters never branch on auth shape. Old `{api_key: ...}` top-level is still accepted for back-compat with stale renderer builds.
- **OAuth-only-for-OpenAI:** the engine rejects `{type: "oauth"}` for any non-openai provider at `from_dict` time, falling through to the stub. Anthropic OAuth stays banned per their TOS.
- **Storage:** single `oauth:openai` secret key with the credential JSON inside the cipher field (not three keys per advisor's recommendation). One decrypt per check; one delete clears all OAuth state.
- **Renderer priority:** when both OAuth tokens AND an API key are stored for OpenAI, OAuth wins (founder's stated preference). Surfaced in the LLM status hint. User-facing override is Phase 7 polish (commented in code).
- **Token confinement:** access/refresh tokens never enter renderer React state. `getOpenAICredentialsForRequest()` is called just-before-WS, attaches the access token to the start frame, returns. Main process is the only place tokens persist.

**Shipped:**

- Engine: `engine/llm_providers.py` `ProviderConfig` rewritten as discriminated-union dataclass with `bearer_token` + `auth_kind` accessors. `from_dict` accepts both new + legacy shapes. `engine/live_debate.py` calls `adapter.open(api_key=config.bearer_token)` and logs `auth=auth_kind` in the per-session stderr line.
- Renderer client: `desktop/src/lib/engine-client.ts` `ProviderConfig.auth` is a TypeScript discriminated union; `streamDebate` threads it into the start frame.
- New: `desktop/electron/oauth-openai.ts` — `OpenAIOAuthService` wrapping pi-ai. Friendly error mapping (port 1455, network, timeout). Single-flight refresh mutex. Cancel-on-success for the manual-paste timer.
- New: `desktop/src/lib/oauth.ts` — typed renderer wrapper for the OAuth bridge.
- `desktop/electron/main.ts` — IPC handlers `oauth:openai:start/status/disconnect/prompt-response/credentials` + event channels `oauth:openai:progress` / `:prompt`. `secrets:get` blocks `oauth:` prefix.
- `desktop/electron/preload.ts` — `tradingAgentsLab.oauth` bridge.
- `desktop/src/vite-env.d.ts` — types for the new bridge surface.
- `desktop/src/pages/Settings.tsx` — `<OpenAIOAuthRow>` above the LLM-providers list. Connect / Disconnect, status display, manual-paste fallback UI, friendly error surface. API-key row reframed as "fallback".
- `desktop/src/pages/Analyze.tsx` — priority resolver: OAuth wins over API key for OpenAI. Just-in-time credential fetch via `getOpenAICredentialsForRequest()` (silent refresh inside 60s expiry window).
- `engine/requirements.txt` unchanged (engine doesn't speak to pi-ai). `desktop/package.json` adds `@earendil-works/pi-ai@^0.74.0`.
- `NOTICE` adds the pi-ai MIT attribution under a new "THIRD-PARTY DEPENDENCIES" section.
- `docs/api.md` updates the WS start-frame documentation to reflect the new `auth` discriminator + back-compat note.
- `docs/architecture.md` §5 updates to describe the OAuth flow and the verification caveat.

**Verification:**
- `npm run type-check`: clean
- `npm run build`: clean (main.js bumped 8 KB → 479 KB to bundle pi-ai's transitive deps; Electron main process only — no renderer impact)
- `bash tools/dev-smoke.sh NVDA 2026-05-08`: **17 passed, 0 failed** (back-compat shape preserved end-to-end)
- Direct unit verification of `ProviderConfig.from_dict` for both shapes + rejection cases (oauth-on-anthropic, empty access, unknown auth type, bogus bearer_token)
- Engine boots clean with the new module
- **Live OAuth flow NOT smoke-tested in this autonomous session** — there's no browser, no founder paste-back, no real OpenAI account. The pi-ai integration is verified by type-check + back-compat smoke + IPC handler registration; the actual "click Connect → browser opens → paste code → token round-trips → live debate uses the OAuth bearer" flow only verifies in the founder's window.
- **Subscription-plan routing claim is account-configuration-dependent** and unverified by either pi-ai or TradingAgentsLab. Founder must verify with a low-cost call + check OpenAI billing dashboard.

**Commit:** `ed35277`.

---

## 2026-05-09 (continued) — Multi-provider live debate (Anthropic, OpenRouter, Gemini)

**Goal:** Founder confirmed they have keys for OpenAI, Anthropic, OpenRouter, Google Gemini (no DeepSeek). Wire all four through one shared `LLMAdapter` abstraction so the live debate path isn't OpenAI-only. Reviewer required this be ONE commit (not three) so the abstraction itself is the review surface.

**Architect protocol followed:**
- ClaudeLink ping to Clawless Advisor for OpenAI OAuth pattern (replied-when-convenient).
- Pre-design advisor consult: required one commit, dictated `LLMAdapter` Protocol shape, said cost caps stay in `live_debate.py` not adapters, said remove DeepSeek from Settings (no engine wiring → bad UX), conservative cost numbers with "as of 2026-05-09" comment.
- Reviewer agent (Sonnet) on the working tree pre-commit. Two functional issues + three doc drifts + several nice-to-haves. All addressed before commit.

**Reviewer fixes applied:**
1. **Adapter resource leak on `WebSocketDisconnect` mid-stream** — `live_debate` wrapped in `try/finally`; `adapter.close()` runs even when `GeneratorExit` is thrown by FastAPI. Logs disconnect reason + agents-completed count to stderr.
2. **`/health.live_default_model` was hardcoded "gpt-4o-mini"** — replaced with `live_providers` (allowlist) + `live_default_models` (per-provider dict).
3. **`docs/api.md` three stale lines** + `docs/architecture.md` §5/§7 stale passages — all updated to reflect 4-provider reality.
4. **Gemini `resp.text` raises `ValueError` on safety-blocked candidates** — wrapped in `try/except` with `[gemini blocked: ...]` fallback so the engine's outer error handler turns it into a clean debate event instead of a SDK stacktrace.
5. **`session.complete.provider` not persisted** — added `provider` column to `sessions` table with in-place `ALTER TABLE` migration for existing DBs (additive, schema_version stays at 1). `SessionSummary` + `SessionDetail` carry it; History row pill + detail pill show "Live · provider · model".

**Architecture choices:**
- `LLMAdapter` is a `Protocol` (structural, not nominal). Four implementations: `OpenAIAdapter`, `OpenRouterAdapter` (extends OpenAI with `_base_url` + `HTTP-Referer`/`X-Title` headers), `AnthropicAdapter` (`AsyncAnthropic`, system prompt at top level not in messages, content block list joined defensively, `usage.input_tokens`/`output_tokens`), `GeminiAdapter` (uses maintained `google-genai`, NOT deprecated `google-generativeai`; sync client wrapped in `asyncio.to_thread`; `system_instruction` as config field; `usage_metadata.prompt_token_count`/`candidates_token_count`).
- `ProviderConfig.from_dict` extended allowlist: `{openai, anthropic, openrouter, gemini}`. `_MAX_TOKENS_HARD_CAP = 800` clamps any caller's request — defense in depth.
- Cost rate table moved to `llm_providers._COST_PER_M_TOKENS` with "As of 2026-05-09. Refresh annually" comment. OpenRouter passthrough has no rate entries (cost depends on the underlying model — surfaces as $0.00 in the UI).
- `default_model` per provider: `gpt-4o-mini` / `claude-haiku-4-5` / `openai/gpt-4o-mini` / `gemini-2.0-flash`. Cheap defaults, founder can override per key by setting model in their config.
- `live_debate.py` import-time assertion: `len(_AGENTS) == MAX_AGENTS_PER_SESSION` — drift fails on import.
- `PROVIDER_PRIORITY` in renderer: openai > anthropic > openrouter > gemini. First-configured-key wins. Surfaced in LLM status card.

**Removed:**
- DeepSeek from `Settings.tsx` LLM Providers tab. Founder doesn't have a key, no engine wiring planned. Bad UX to ship configurable-with-no-engine. 5-line restore if a key appears later.

**Verification:**
- `npm run type-check`: clean
- `npm run build`: clean
- `bash tools/dev-smoke.sh NVDA 2026-05-08`: **17 passed, 0 failed** (stub regression preserved end-to-end; sessions migration works on fresh + existing DBs)
- Direct storage round-trip of `provider` field verified outside the smoke
- Provider rate table cost estimate sanity-checked at import

**Commit:** `8a9526b`.

**Clawless Advisor reply (received 2026-05-09 01:21):** OAuth substance deferred to founder's morning audit — Advisor doesn't have direct working knowledge of Clawless's OpenAI OAuth pointers and won't pull clawless-developer off the launch-blocker (~5 days to GA on Clawless v5). Will surface back to me when founder picks which OAuth path to mirror (OpenClaw-engine vs Clawless-wrapper). Validates the multi-provider-first sequencing — "build all three API-key paths cleanly first; the OAuth path will land cleaner on top of stable API-key plumbing." Anthropic + OpenRouter share the `messages` API shape; Gemini is the outlier (different shape + `x-goog-api-key` header). All three already shipped in `8a9526b`.

---

## 2026-05-09 (continued) — Watchlist page + dead-code cleanup

**Goal:** Replace the ComingSoon Watchlist placeholder with a real, SQLite-backed page that lets the founder track tickers and one-click into Analyze. Per advisor, this is a separate commit from History.

**Architect protocol followed:**
- Skipped pre-design advisor (constrained shape: add/list/remove + a deep-link).
- Reviewer agent (Sonnet) on the working tree pre-commit. Verdict: "Ready to commit, with follow-ups." 3 strong-recommends + 1 cosmetic — all four addressed in the same commit.

**Shipped:**

- Engine: `engine/storage.py` adds `watchlist` table to the schema DDL (additive — schema_version stays 1, `IF NOT EXISTS` covers in-place upgrades), `WatchlistEntry` dataclass, `list_watchlist`, `add_watchlist` (raises `WatchlistConflict` on duplicate via narrow `IntegrityError` mapping), `remove_watchlist`. `engine/server.py` adds `GET /watchlist`, `POST /watchlist` (409 on duplicate, 400 on empty-after-strip, 422 on Pydantic length violation), `DELETE /watchlist/{ticker}` (404 on missing). `WatchlistAddRequest` Pydantic model with `max_length=8` ticker + `max_length=200` note.
- Renderer: `desktop/src/lib/engine-client.ts` adds `WatchlistEntry` type + `listWatchlist`, `addWatchlist`, `removeWatchlist` typed wrappers. 409 surfaces as a friendly "already on the watchlist" error.
- Renderer: `desktop/src/pages/Watchlist.tsx` + `Watchlist.module.css` — add-ticker form (auto-focus on mount + refocus after success), card-style row list with ticker + relative timestamp + optional note, primary "Analyze" button per row, secondary "Remove" with confirm. Empty state guides user to add a ticker.
- Renderer: `desktop/src/lib/handoff.ts` (NEW) — exports `PENDING_TICKER_KEY`, `setPendingTicker`, `consumePendingTicker`. Both Watchlist and Analyze import from here so the constant doesn't drift.
- Renderer: `desktop/src/pages/Analyze.tsx` — uses `consumePendingTicker()` in the initial-state initializer to honor a watchlist hand-off. Aligned `maxLength` from 6 to 8 to match the engine's accepted range.
- Renderer: `desktop/src/App.tsx` — `<Watchlist />` replaces `ComingSoon` on the `'watchlist'` route. Removed the `ComingSoon` import (now unused).
- Cleanup: deleted `desktop/src/pages/ComingSoon.tsx` and `ComingSoon.module.css` — no remaining usages now that all four routes have real pages.

**Reviewer fixes applied:**

1. `docs/api.md` — added full documentation for the three new watchlist endpoints (request/response shapes, status codes, CORS note).
2. `tools/dev-smoke.sh` — extended from 12 to 17 assertions. Added `POST /watchlist` accept, 409 on duplicate, GET shows the ticker, DELETE returns 200, second DELETE returns 404.
3. `desktop/src/lib/handoff.ts` — extracted to remove the cross-file constant duplication between Watchlist and Analyze.
4. `Analyze.tsx` ticker `maxLength` aligned 6 → 8.

**Verification:**
- `npm run type-check`: clean
- `npm run build`: clean
- `bash tools/dev-smoke.sh NVDA 2026-05-08`: **17 passed, 0 failed**

**Commit:** `4b88894`.

---

## 2026-05-09 (continued) — History page

**Goal:** Replace the ComingSoon placeholder with a real History page that reads from the SQLite session storage shipped in `7dbbeff`. Per advisor, this is its own commit + reviewer pass — separate from the engine layer and the Watchlist that comes next.

**Architect protocol followed:**
- Skipped pre-design advisor (paved path: list view + detail view + delete, types are dictated by `docs/api.md`).
- Reviewer agent (Sonnet) on the working tree pre-commit. Verdict: "Ready to commit" with one race condition (rapid row clicks) and one backlog note (no fetch timeout).
- Race condition fixed via generation counter; timeout queued in backlog as Phase 7 follow-up.

**Shipped:**

- New: `desktop/src/pages/History.tsx` (~250 LoC). Two-view state machine: `'list'` and `'detail'`. List shows newest-first session rows with ticker, action pill (BUY/SELL/HOLD color-coded), confidence %, live/stub badge, relative timestamp, est cost, two-line clamped reasoning. Empty state guides the user to the Analyze page. Stat strip across the top: total sessions, live count, stub count, total live cost. Detail view: header with Back + Copy transcript + Delete buttons, ticker/date summary block with live/stub pill + cost meta, and the full debate replayed via the existing `DebateStream` component (with `isStreaming={false}`).
- New: `desktop/src/pages/History.module.css` (~330 LoC). All styles use the existing token system. Action pill variants for buy/sell/hold. Row hover lifts border-color to amber.
- Updated: `desktop/src/lib/engine-client.ts` — added `SessionSummary`, `SessionDetail` types matching `engine/storage.py` field-for-field; new `listSessions`, `getSession`, `deleteSession` typed wrappers; expanded `HealthInfo` to include `live_supported`, `live_default_model`, `storage_path`.
- Updated: `desktop/src/App.tsx` — swapped `<ComingSoon ...>` for `<History />` on the `'history'` route.

**Reviewer fixes applied:**

- Race condition: rapid row clicks could let a slow earlier fetch land after a faster later one, stomping the UI with the wrong session. Added a `detailGenRef` generation counter; `onOpen` increments and only commits the result when its generation matches the latest. Same guard on the error path.

**Verification:**
- `npm run type-check`: clean
- `npm run build`: clean
- Engine smoke (12/12) preserved (no engine changes in this commit)

**Commit:** `d736e6e`.

---

## 2026-05-09 (continued, third autonomous block) — SQLite session storage + parallel KB

**Goal (storage chunk):** Persist completed debates so the History page (next chunk) and any future analytics have something to read. Per advisor, ship the engine layer alone first; History UI is a separate commit.

**Architect protocol followed (advisor before, write, reviewer after):**
- Pre-design advisor consult: said skip the design call ("paved path"), specified schema, file location (`<repo>/data/sessions.db`), env override (`TAL_SESSIONS_DB`), and the must-include endpoints (list / get / delete). Followed verbatim.
- Implementation: `engine/storage.py` (220 LoC) + 3 endpoints in `server.py` + best-effort write-on-stream-end + extended `tools/dev-smoke.sh` from 8 → 12 assertions.
- Code reviewer (Sonnet) caught 1 blocking issue (missing `DELETE` in CORS allowlist) + 3 strong-recommends (decision dict guard, docs/api.md drift, style consistency). All 4 fixed before commit.

**Shipped:**

- New: `engine/storage.py` — versioned-schema SQLite layer. WAL mode, atomic file create, hard-fail on schema-version-newer-than-supported. Public surface: `write_session`, `list_sessions(limit, ticker)`, `get_session(id)`, `delete_session(id)`, plus `db_path()` for `/health` to surface. ULID-style ids (millisecond epoch + 8 random bytes hex). Best-effort everywhere — every public function returns gracefully on errors and logs to stderr; the WS handler treats persistence as non-blocking.
- Updated: `engine/server.py` — captures the WS event sequence in memory while streaming, calls `_persist_session_safe` after `session.complete` (skips write entirely on aborted streams). New endpoints: `GET /sessions?limit&ticker`, `GET /sessions/{id}`, `DELETE /sessions/{id}`. CORS `allow_methods` now includes `DELETE`. `/health` gains `storage_path` field.
- Updated: `.gitignore` — adds `data/` so user session data never gets committed.
- Updated: `tools/dev-smoke.sh` — extended from 8 to 12 assertions covering the full sessions round-trip (list → get-by-id → delete → 404 verification).
- Updated: `docs/api.md` — full documentation of the three new endpoints + `/health.storage_path` + persistence model section. Removed the stale "session manager + persistence is Phase 7" line.

**Parallel knowledge base (`docs/kb/`):**

A documentation specialist sub-agent (Sonnet) built 11 user-facing KB files in parallel while this storage chunk was implemented. Files are cross-linked, voice is educational/calm, posture is locked ("educational + paper trading"). The agent caught one bug — the original `reading-the-debate.md` referenced a fabricated "Analyzing…" button label state; corrected against the real `Analyze.tsx` ternary. Also flagged that `docs/architecture.md` §7 lists Gemini/xAI/Qwen/GLM as LLM providers but `Settings.tsx` only ships OpenAI / Anthropic / DeepSeek / OpenRouter — needs reconciliation in a follow-up.

**Verification:**
- `npm run type-check`: clean
- `bash tools/dev-smoke.sh NVDA 2026-05-08`: **12 passed, 0 failed** (was 8/8 — added 4 new assertions for sessions round-trip)
- KB files manually inventoried; all 11 present and linked

**Commits:** `7dbbeff` (storage + KB combined).

---

## 2026-05-08 (continued, third autonomous block) — Phase 2.1-light real-LLM debate

**Goal:** Replace the canned stub debate with real OpenAI calls when a key is configured. Keep the stub path as the default so the demo still works without one. Per advisor design review, ship the *minimal own-prompts* implementation rather than a full upstream-graph wrapper — smaller blast radius, controllable cost, debuggable.

**Architect protocol (advisor before, write, reviewer after):**

- Pre-design advisor consult: scoped Phase 2.1-light, flagged five pitfalls (architecture.md drift, cost caps, reviewer protocol, storage chunk landmine, token-streaming-vs-complete), required OpenAI reachability test before building.
- OpenAI reachability test: `urllib.request.urlopen('https://api.openai.com/v1/models', timeout=5)` returned 401 (reachable, just unauthorized). Plan locked.
- Built engine/live_debate.py + provider_config plumbing in server.py + renderer wiring in Analyze.tsx + DebateStream.tsx
- Code review (general-purpose Sonnet agent) on the working tree before commit. 3 strong-recommends + 2 nice-to-haves; addressed all five before commit.

**Reviewer fixes applied:**

1. **Unsupported provider crash** — `ProviderConfig.from_dict` now rejects non-openai providers at the boundary (returns `None` → WS falls through to stub). Defense-in-depth inside `live_debate()` yields a graceful `session.complete` with HOLD@0.0 if a future caller bypasses `from_dict`.
2. **Client per call** — lifted `AsyncOpenAI` construction from per-agent (12×) to per-session (1×). Explicit `await client.close()` after the agent loop.
3. **docs/api.md stale fields** — updated `engine_state` to `"ready"` (always — capability not session-state), added `provider_config` to WS start frame example, refreshed `session.complete` schema with live fields, removed "Provider-config plumbing not yet defined here" line.
4. **`hasOpenAIKey` effect dep** — skip refresh when streaming starts; only re-poll on stream end + page mount + resetSignal.
5. **Cost-budget comment** — added one-liner documenting ~$0.005/session estimate at defaults.

**Shipped:**

- New: `engine/live_debate.py` — sequential per-agent OpenAI loop. 12 agents in 4 phases mirroring upstream. Cost caps: `max_tokens=400`, `MAX_AGENTS_PER_SESSION=12` (asserted at import), default `gpt-4o-mini`. Per-session estimated cost logged to stderr.
- `engine/server.py` — `ProviderConfig.from_dict(start.get("provider_config"))`. When config returns non-None, run `live_debate()`; else `canned_debate()`. `engine_state` flipped from `"stub"` to `"ready"` (capability), added `live_supported`, `live_default_model`.
- `engine/requirements.txt` — added `openai>=1.50.0`.
- Renderer: `engine-client.ts` adds `ProviderConfig` + `SessionCompleteEvent` types with optional live metadata. `streamDebate` includes `provider_config` in start frame when present.
- `desktop/src/pages/Analyze.tsx` — reads `llm:openai` from secrets bridge before each session, threads into start frame. LLM status card flips from "Not configured" to "OpenAI · live". Helper text adapts.
- `DebateStream.tsx` — decision card shows "Live · model" badge when `session.complete.live === true`, plus token counts + estimated cost beneath.
- `docs/api.md` — updated to match the new wire shape (engine_state, provider_config, session.complete live fields, out-of-scope refreshed).
- `docs/architecture.md` §5 — replaced the original "wrap upstream" sketch with the actual Phase 2.1-light design, calling out the deferred full-upstream integration as future work.

**Verification:**

- `npm run type-check`: clean
- `npm run build`: clean
- `bash tools/dev-smoke.sh NVDA 2026-05-08`: 8 passed, 0 failed (stub path preserved end-to-end)
- **Live path: NOT smoke-tested in autonomous block** — the autonomous session has no OpenAI key (it lives in the founder's OS keychain). The `provider_config` plumbing is verified by the type-checker + the from_dict allowlist + the reviewer; the actual OpenAI call path is verified when the founder pastes a key and clicks Analyze.

**Commit:** `75d020e`.

---

## 2026-05-08 (continued) — tooling + docs + small UX cap

**Goal:** Wrap the autonomous block with durable assets — a one-shot smoke script future sessions can run instead of curl-by-hand, and a contract doc so a fresh Claude doesn't have to re-derive the engine API by reading source.

**Shipped:**

- New: `tools/dev-smoke.sh` (executable). Spawns the engine sidecar, parses the handshake, and runs 8 assertions against the contract:
  1. `/health` returns 401 without bearer
  2. `/health` returns 200 + `data_provider` with bearer
  3. `OPTIONS /analyze` CORS preflight from `http://localhost:5173` returns 200
  4. `POST /analyze` returns the `HOLD` stub
  5. `GET /data/summary` returns real OHLCV (`last_close > 0`, `sessions ≥ 1`)
  6. `GET /data/summary` returns 404 on bogus ticker
  7. `GET /data/news` returns a list
  8. `WS /stream` sends ≥16 events covering all 4 phases, ends with `session.complete` and clean close 1000
  - Tears down the engine on exit (trap). Exit code 0 on all-pass, non-zero otherwise. Verified all 8 pass against current commit.
- New: `docs/api.md` — full engine API contract: auth, every HTTP endpoint shape, WS event types and order, agent name canon per phase, process model (spawn / handshake / teardown), smoke entry point, and the explicit out-of-scope list. ~6 KB; expected to be the first thing a fresh Claude session reads after CLAUDE.md.
- Updated: `CLAUDE.md` doc graph adds `docs/api.md`.
- Updated: `desktop/src/pages/Analyze.tsx` — date input gains `max=<today>` so users can't request future bars (yfinance returns empty for them; this is a small UX cap, not a hard guard).

**Verification:**

- `bash tools/dev-smoke.sh NVDA 2026-05-08` → 8 passed, 0 failed
- npm run type-check clean

**Commits:** `be6d12d` (one bundled commit).

---

## 2026-05-08 (continued) — keyboard shortcuts + Electron app menu

**Goal:** Make the desktop app feel like a real desktop app — proper menu bar with accelerators, page-level shortcuts for the streaming flow.

**Shipped:**

- New: `desktop/electron/menu.ts` — full app menu template with mac-aware structure (App / File / Edit / Go / View / Window / Help on macOS; same minus App on others). Accelerators wired:
  - **Cmd/Ctrl + N** — File → New analysis (clears prior results, focuses Analyze)
  - **Cmd/Ctrl + .** — File → Stop streaming
  - **Cmd/Ctrl + 1/2/3** — Go → Analyze / Watchlist / History
  - **Cmd/Ctrl + ,** — Go → Settings (also under macOS App menu as the conventional Settings…)
  - Standard cut/copy/paste, reload, devtools, zoom, fullscreen, minimize/zoom under their conventional menus
  - Help → opens repo URL or new-issue URL via `shell.openExternal`
- Updated: `main.ts` registers the menu via `registerAppMenu(() => win)` on `whenReady`. Menu actions send IPC messages (`menu:navigate`, `menu:new-analysis`, `menu:stop-stream`) to the focused window.
- Updated: `preload.ts` adds `tradingAgentsLab.onMenuCommand(channel, handler) => unsubscribe` returning a teardown so the renderer can drop listeners on unmount.
- Updated: `vite-env.d.ts` types the menu bridge.
- Updated: `App.tsx` wires the menu bridge — `menu:navigate` updates the route, `menu:new-analysis` increments a `resetSignal` prop forwarded to `Analyze`.
- Updated: `Analyze.tsx`:
  - Accepts `resetSignal` prop; bumping it clears `events`, `streamError`, `copied` and aborts an in-flight stream.
  - Listens for `menu:stop-stream` and calls `handle.close()`.
  - Page-level `keydown` handler binds **Cmd+Enter to run** and **Cmd+. to stop**. Engine-ready + streaming state is read from refs to avoid stale-closure issues across the keydown lifetime.
  - Footer label bumped to `Phase 4`.

**Verification:**

- npm run type-check + production build clean (main.js 4.99 KB → 7.96 KB to fit menu module + accelerator template)
- IPC bridge surface remains backward-compatible (`tradingAgentsLab.onMenuCommand` is additive)

**Commits:** `0de893a` (one bundled commit with menu + main + preload + types + App + Analyze + docs).

---

## 2026-05-08 (continued, second autonomous block) — news headlines via yfinance

**Goal:** Per advisor, the highest-leverage stretch after Phase 4 was real news headlines via `yfinance.Ticker.news` — additive, no new deps, no architectural commitment.

**Shipped:**

- `engine/data_providers.py` adds `Headline` dataclass + `news_headlines(ticker, limit)` on the `BaseDataProvider` Protocol + `YFinanceProvider` impl. Handles defensive shape-checks on Yahoo's payload (it's changed before).
- `engine/server.py` exposes `GET /data/news?ticker=X&limit=N` (502 on provider errors, never 404 — empty list is valid).
- WS `/stream` emits a `news.headlines` event after `data.summary` and before the debate. Best-effort: failures yield an empty list, debate still runs with the legacy "no catalysts" canned message.
- `engine/stub_debate.py` rewires the news_analyst message to bullet the real headlines + publishers when present, falls back to the canned message when none.
- Renderer:
  - `engine-client.ts` adds `Headline` + `NewsHeadlinesEvent` types and extends the `DebateEvent` union.
  - `DebateStream.tsx` renders a "News" section between the data summary strip and the phase cards. Each headline links to the canonical Yahoo Finance URL (`target="_blank"`); publisher + relative pub time render below in mono.
  - `DebateStream.module.css` adds `.news`, `.newsList`, `.newsItem` styles consistent with the existing card aesthetic.
  - `transcript.ts` includes a "News headlines" section in the Markdown export with linked titles and publisher/timestamp metadata.

**Verification:**

- `/data/news?ticker=NVDA` returns real headlines from real publishers (Motley Fool, Yahoo Finance Video, MarketBeat) with valid URLs
- WS stream emits 4 headlines pre-debate, news_analyst message bullets them
- npm run type-check + production build clean

**Commits:** `a984179` (one bundled commit with engine + renderer + docs).

---

## 2026-05-08 (continued) — Phase 4 main: secret storage + Settings UI

**Goal:** Wire Phase 4 secrets end-to-end so founder can paste API keys (OpenAI, Anthropic, etc.) and they persist encrypted at rest. Per advisor scope guard, the "engine consumes the keys" wiring stays held for Phase 2.1.

**Architecture decision:** chose Electron `safeStorage` over `keytar` — no native dependency, same OS-level encryption guarantee on Mac/Windows (Linux without keyring hard-fails as designed). Storage is a versioned JSON file at `<userData>/secrets.json` containing only base64-encoded encrypted blobs. Plaintext never touches disk.

**Pre-empts in this commit (per advisor):**

- Hard-fail on `safeStorage.isEncryptionAvailable() === false` — UI surfaces a banner; no silent plaintext fallback
- Versioned schema (`{version: 1, entries: {...}}`) — cheap now, painful to retrofit
- Never re-display stored values — UI shows last-4 hint only (`…sk-1234`)
- No "Test connection" button that calls the provider — would burn founder's quota autonomously while they sleep
- No localStorage Watchlist/History — that decision belongs in SQLite per `architecture.md`

**Shipped:**

- New: `desktop/electron/secrets.ts` — safeStorage wrapper with atomic file writes (write-tmp + rename) and 0600 file mode. Exports `setSecret`, `getSecret`, `deleteSecret`, `listSecrets`, `isEncryptionAvailable`, `secretsFileLocation`.
- Updated: `desktop/electron/main.ts` — registers IPC handlers `secrets:{availability,set,get,list,delete}`.
- Updated: `desktop/electron/preload.ts` — exposes `tradingAgentsLab.secrets` on the contextBridge.
- Updated: `desktop/src/vite-env.d.ts` — ambient types for the new bridge surface.
- New: `desktop/src/lib/secrets.ts` — typed renderer wrapper.
- Rewritten: `desktop/src/pages/Settings.tsx` — every tab now calls into the bridge. Each row has Configure / Replace / Delete; stored entries show last-4 hint + relative timestamp. About tab shows the encryption status, secrets file path, and entry count so founder knows where to back up.
- Updated: `desktop/src/pages/Settings.module.css` — editor inline form, action variants, danger button, code block, availability banner.

**Verification:**

- npm run type-check: clean
- npm run build: clean (main.js bumped from 2.56 KB → 4.99 KB to fit the new IPC + secrets module)
- Dev launch smoke: Electron starts, Vite ready, engine spawned, no IPC registration errors
- Manual functional smoke pending founder review (same caveat as Phase 3 — needs UI click-through that autonomy can't drive)

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

- `c5815fa` — Phase 3: wire desktop renderer to engine sidecar end-to-end

**Stretch shipped after Phase 3:**

1. **Phase 4 UI spike** (commit `e716d86`) — Settings page reachable from the sidebar with hash-based routing, 5 tabs (LLM Providers, Data Providers, Broker, Clawless, About) showing the provider matrix with disabled `Configure` buttons and a phase-guard footer. Watchlist + History pages render `ComingSoon` placeholders. **No keytar / native dep / secret storage** — that's gated on founder check-in per advisor scope guard.

3. **Phase 5 polish: Stop button + accurate Data status + transcript export** (commit `de030ee`) — three small UX wins in one commit. Stop button replaces Analyze while streaming and calls `handle.close()` to abort the WS. The Data status card now reads `/health.data_provider` after handshake, flipping from "Pending…" to "yfinance · live" with a green dot. A "Copy transcript (Markdown)" button appears once `session.complete` lands; clicking copies a structured Markdown transcript (header, decision, data summary, all phases, all agent messages) to the clipboard with a transient "Copied ✓" affordance.

2. **Phase 5 part 1: yfinance data integration** (commit `5273904`) — engine sidecar now ships a `BaseDataProvider` Protocol + `YFinanceProvider` default. Real NVDA data verified: $211.50 last close, +19.38% over 24 sessions, 147M avg volume. New endpoints + WS event:
   - `GET /data/summary?ticker=X&trade_date=Y` returns real OHLCV summary or 404 on unknown ticker
   - WS `/stream` emits a `data.summary` event before the canned debate
   - analyst/researcher/trader messages inject real numbers — e.g., technical_analyst now reads "*last close 211.50, 19.38% up over the 24-session window (range 173.66–216.83). Avg daily volume ≈ 147,571,146.*"
   - Decision reasoning anchors on the real ticker + price + window
   - Network-failure path: stream gracefully falls back to original canned messages
   - Renderer surfaces a compact summary strip (last close · period change · range · avg volume · source) at the top of the debate panel. Period change is colored green/red.

**Next session opens with:** founder smoke-tests the four-commit run end-to-end:

1. `npm run dev` from `/Users/junaidsiddiqi/Projects/TradingAgents/desktop` — Engine status flips to "Running" within 2-3s, Data status flips to "yfinance · live"
2. Click **Analyze** with default ticker `NVDA` — summary strip appears (last close ~$211, +19% period change), 17 debate events stream over ~7s, decision card lands with HOLD@55% confidence
3. Click **Stop** mid-stream on a second run — abort is clean, no errors
4. Click **Copy transcript (Markdown)** after a complete run — paste somewhere; expect a structured Markdown doc with decision, data summary, all 4 phases
5. Navigate to **Settings** in the sidebar — see the tab structure, all `Configure` buttons disabled with the phase-guard footer

**If any of those don't work, fix that before continuing.** Likely candidates: the IPC handshake promise (Phase 3), CORS preflight against the actual sidecar port (Phase 3), or yfinance reachability if Yahoo is rate-limiting (Phase 5). All are diagnosable from the engine sidecar's stderr in the Electron console.

**Next chunks (founder's call):**

- **Phase 4 secrets wiring** — `keytar` install + first BYO LLM key (OpenAI). Gated on founder go-ahead because adding a native dep deserves a yes.
- **Phase 2.1 — replace stub debate with real `tradingagents` core.** Needs founder to pick the first LLM provider (OpenAI seems most likely) and supply a key.
- **Phase 5 part 2** — Alpaca data provider (needs API key + keychain), `BaseBroker` abstraction, paper-trading order endpoint.
- **Phase 6** — Clawless gateway tap. The probe (`tools/clawless-probe.mjs`) is the working reference protocol code.

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
