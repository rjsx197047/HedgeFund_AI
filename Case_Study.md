# Case Study: A 30-Day Forward Test of HedgeFund AI on GOOGL, AAPL, and MSFT

> **Status: pre-registered, scoring pending.** Entry date 2026-06-20. Scoring date on or after 2026-07-20.
>
> **Educational research only. Not investment advice.** This document records an experiment in how a multi-agent large language model system reasons about three stocks. It is not a recommendation to buy, sell, or hold anything, and nothing here forecasts the market. See the disclaimer at the end.

## Why this document exists

A common and fair question about any analysis tool is the blunt one: **is it actually right?** This case study answers that question the only honest way it can be answered, by writing down the system's calls in advance, then grading them against what the market actually does, with no opportunity to move the goalposts afterward.

A 30-day accuracy number cannot be produced on day one. By definition, you have to wait the 30 days. So this is a **pre-registration**: the predictions below are locked in on the entry date, and a short, reproducible scoring procedure (built into the app's Scorecard) fills in the results once the horizon matures. Anyone can re-run it and check the math.

## What is being tested

| Item | Value |
|---|---|
| Tickers | GOOGL (Alphabet), AAPL (Apple), MSFT (Microsoft) |
| Entry date (anchor) | 2026-06-20 (analysis uses the last trading session on or before this date) |
| Horizons scored | 5 trading days and 20 trading days |
| Primary horizon for "30 days" | 20 trading days, which is roughly 30 calendar days, maturing on or about 2026-07-20 |
| System under test | HedgeFund AI, the 12-agent debate (4 analysts, bull and bear researchers, research manager, trader, and a 4-member risk committee) |
| Model used for this run | Local Ollama, llama3.2 (see the honesty note below) |
| Data at entry | Yahoo Finance news headlines and partial social sentiment were available. Daily price history was rate-limited by the data provider at entry time, so the analysts ran with reduced price context. |

### Honesty note on this run's configuration

This run was produced with a **small local model (llama3.2, roughly 3 billion parameters)** rather than a frontier model, and with **reduced live price data** because the free data provider was rate-limiting this network at entry time. That makes this a deliberately humble baseline, not the system at its strongest. The value here is the **method**: the experiment is fully specified and reproducible, so you can run the identical protocol with a stronger model (OpenAI, Anthropic, Gemini, xAI, and others are all supported) and full data, and compare. The scoring step pulls real historical prices at maturity, so the grading is unaffected by the entry-time data limitation.

## How scoring works

Scoring is not subjective. The app's Scorecard grades each decision against the realized price move using a fixed rule (implemented in `engine/outcomes.py`):

- A **BUY** is **aligned** when the return over the horizon rises above a small noise band.
- A **SELL** is **aligned** when the return falls below the negative of that band.
- A **HOLD** is **aligned** when the return stays inside the band.
- Anything else is **contrary**.

The noise band exists so that ordinary day-to-day drift does not flip a verdict. It is plus or minus 1.5 percent at the 5-day horizon and plus or minus 3 percent at the 20-day horizon. Entry price is the close on the last session at or before the entry date; exit price is the close the given number of trading days later.

This is deliberately a directional, modest test. It asks "did the call point the same way the market then moved, beyond noise," not "did it nail a price target."

## The predictions (locked in on 2026-06-20)

<!-- PREDICTIONS -->
All three debates ran to completion through the engine's WebSocket stream, each producing the full 12-agent transcript across the four phases (analysts, researchers, trader, risk committee). The decisions are saved as live sessions in the local store (`data/sessions.db`), so the Scorecard can grade them later.

| Ticker | Call | Confidence | Saved session id |
|---|---|---|---|
| GOOGL | BUY | 0.85 | `019ee5e5f19e-e17cfe50` |
| AAPL | BUY | 0.85 | `019ee5e84783-946bb230` |
| MSFT | BUY | 0.80 | `019ee5ea836c-c9df9230` |

The committee was uniformly bullish on all three large-cap names at this entry date. With only three large-cap technology stocks in a single up-leaning news window, that uniformity is itself worth noting: it could reflect a genuinely constructive setup, or it could reflect a bias in a small local model toward agreeable, bullish output. The 30-day scoring is exactly what separates those two explanations.

The trader and risk committee produced usable narrative reasoning where the model was up to it. The clearest example, the AAPL decision rationale, read verbatim:

> "I lean towards buying AAPL due to the bullish momentum, neutral to bullish tone in prior turns, and the potential long-term benefits of having Intel as a chip supplier outweighing concerns about increased production costs and supply chain disruptions. A conservative yet opportunistic approach is recommended, targeting a slightly higher price range than current support levels while scaling up by 20-30% if the trend continues upwards."

For GOOGL and MSFT, the small local model collapsed its final answer to the bare decision fields rather than prose. That is a known limitation of running a roughly 3 billion parameter model in a 12-agent chain, and it is one of the things a re-run with a frontier model would improve. The gradeable output (the call and the confidence) is intact for all three.
<!-- /PREDICTIONS -->

## Inside the debates: what the agents actually argued

The final BUY calls are only the last line of a long transcript. Reading the full 12-agent debates is where the case study earns its keep, because it shows both the parts of the system that worked and the parts that broke down on a small local model with limited data. All quotes below are verbatim from the saved sessions.

**The pipeline did its job structurally.** Each debate moved cleanly through all four phases, and the analysts engaged with the real news that the engine fetched. The GOOGL debate centered on a real headline about a senior AI executive leaving Alphabet. The AAPL debate centered on a headline about an Apple and Intel chip partnership. The MSFT sentiment analyst correctly read a mixed StockTwits tone. So the data-to-debate plumbing worked: real headlines reached the agents and shaped the discussion.

**Three failure modes showed up clearly, and they all trace back to running a roughly 3 billion parameter model without live price data:**

1. **The bull and bear roles collapsed into agreement.** The bear researcher is supposed to argue the downside. On this model, it did not. On GOOGL the bear opened with "I firmly believe that GOOGL's stock is poised for significant gains in the coming months." On MSFT the bear said "I firmly believe that Microsoft has the potential to continue its upward trajectory." When the designated skeptic argues the bull case, the debate loses the very tension that makes a multi-agent setup valuable. This is the single most important thing to fix with a stronger model, and it is exactly the kind of thing the comparison arm below tests.

2. **The analysts invented price levels.** Because daily price history was rate-limited at entry, the technical analyst and trader had no real prices to work from, and they filled the gap with plausible-sounding but wrong numbers. The GOOGL trader proposed an "Entry price: $3050 (above the recent high of $2945)," levels from before Alphabet's 2022 stock split rather than the actual trading range. The MSFT trader anchored on a "$344 resistance level" and a "$340" entry. One agent went further and referenced "SpaceX's acquisition of Marvell Technology," an event that did not happen. AAPL fared better, with plausible levels around $180 to $230, but the lesson holds: with the price feed down, the model confabulates.

3. **Internal disagreement was overridden without comment.** On AAPL the research manager concluded that "the bear case carries a better risk-adjusted argument for the next few trading sessions," yet the final decision came back BUY anyway. A stronger model should either reconcile that tension or let it lower the confidence.

**One honest moment is worth highlighting.** The MSFT fundamental analyst flatly admitted "I don't have access to real-time or historical data," which is precisely the disclosure you want from an analysis tool when its inputs are missing, rather than a confident fabrication.

The takeaway for the scoring ahead: these three BUY calls were produced by a debate that was partially compromised (no working skeptic, no real prices on two of three names). Whatever the 30-day verdicts turn out to be, they should be read as a measurement of this constrained baseline, not of the system at full strength. That is the whole reason the next section exists.

## A second model for comparison

To test whether the uniform bullishness and the role collapse are properties of the system or just of one small model, the identical experiment (same three tickers, same entry date, same prompts and scoring) was re-run with **deepseek-r1:8b**, a larger local reasoning model. Both arms are saved as live sessions, so the Scorecard grades them side by side.

<!-- DEEPSEEK -->
_The deepseek-r1 arm is running. This table is filled in once it completes._

| Ticker | llama3.2 call | llama3.2 conf | deepseek-r1 call | deepseek-r1 conf | Agreement |
|---|---|---|---|---|---|
| GOOGL | BUY | 0.85 | _pending_ | _pending_ | _pending_ |
| AAPL | BUY | 0.85 | _pending_ | _pending_ | _pending_ |
| MSFT | BUY | 0.80 | _pending_ | _pending_ | _pending_ |
<!-- /DEEPSEEK -->

If the two models disagree on a ticker, that disagreement is itself a useful signal: it means the call is sensitive to the model rather than driven by the data, and the eventual price move will show which model read the setup better. If they agree, the call is at least model-robust, though still not necessarily correct.

## Results (to be completed on or after 2026-07-20)

These rows are intentionally blank until the horizon matures. To fill them, run the scoring procedure below; the numbers come straight from the Scorecard, computed against real historical closes.

### 5 trading day horizon (matures on or about 2026-06-27)

| Ticker | Call | Confidence | Entry close | Exit close | Return | Verdict |
|---|---|---|---|---|---|---|
| GOOGL | BUY | 0.85 | _pending_ | _pending_ | _pending_ | _pending_ |
| AAPL | BUY | 0.85 | _pending_ | _pending_ | _pending_ | _pending_ |
| MSFT | BUY | 0.80 | _pending_ | _pending_ | _pending_ | _pending_ |

### 20 trading day horizon, the primary "30 day" result (matures on or about 2026-07-20)

| Ticker | Call | Confidence | Entry close | Exit close | Return | Verdict |
|---|---|---|---|---|---|---|
| GOOGL | BUY | 0.85 | _pending_ | _pending_ | _pending_ | _pending_ |
| AAPL | BUY | 0.85 | _pending_ | _pending_ | _pending_ | _pending_ |
| MSFT | BUY | 0.80 | _pending_ | _pending_ | _pending_ | _pending_ |

**Aggregate (fill in at maturity):** aligned ___ of 3 at 5 days, ___ of 3 at 20 days.

## How to reproduce the scoring

The three debates are already saved in the local session store, so the Scorecard can grade them. On or after the maturity date, from the repository root:

```bash
# 1. Start the engine (or just open the desktop app, which spawns it)
engine/.venv/bin/python -m engine   # prints a port and token on stdout

# 2. Score every matured session against real historical closes
curl -s -X POST -H "Authorization: Bearer <TOKEN>" \
  http://127.0.0.1:<PORT>/outcomes/refresh

# 3. Read the graded scorecard
curl -s -H "Authorization: Bearer <TOKEN>" \
  http://127.0.0.1:<PORT>/scorecard | python3 -m json.tool
```

Or, in the desktop app, open the **Scorecard** page and click **Score new outcomes**. The aligned and contrary verdicts, the by-decision breakdown, and the confidence calibration table all populate from the same data. Copy the GOOGL, AAPL, and MSFT rows back into the tables above.

## How to reproduce the predictions with a stronger model

To run the identical experiment at full strength, configure a frontier provider in the desktop app's Settings (or pass its `provider_config` on the engine's `/stream` WebSocket), then run an analysis on each ticker with the same entry date. The protocol, the tickers, and the scoring rule stay exactly as written here. That is the point of pre-registering: the only thing that changes is the engine under the hood, and the comparison stays fair.

## What a careful reader should take away

- Three calls on three large-cap stocks over one month is a **tiny sample**. It can illustrate the method and surface a vivid example, but it cannot establish that the system is reliably accurate. Real evaluation needs many tickers across many time windows and market regimes.
- A directional, beyond-noise test is a low bar on purpose. Passing it is necessary, not sufficient.
- Confidence calibration (does an 85 percent confidence call actually land more often than a 55 percent one?) matters as much as the raw hit rate, and needs far more than three data points to assess.
- Past alignment carries no information about future market behavior.

## Disclaimer

HedgeFund AI is an open-source research and learning tool. It is not a registered investment advisor, a broker, or a hedge fund, and it does not place orders or move money. It surfaces multiple large language model perspectives on tickers you choose, and those perspectives can be incomplete or wrong. Nothing in this document is a recommendation to buy, sell, or hold any security or other asset, and nothing here predicts the market. Past analysis carries no information about future results. Always do your own research and consult a licensed professional before making any financial decision.
