# Scorecard

The Scorecard page shows how past live analyses compared with what the market actually did afterward. It is the honest mirror of the History page: History records what the agents said, the Scorecard records whether the market subsequently moved the same way.

## What gets scored

Every completed live debate is scored at two horizons:

| Horizon | Noise band |
|---|---|
| 5 trading days | plus or minus 1.5% |
| 20 trading days | plus or minus 3.0% |

For each session the engine looks up the daily close on the trade date (the entry, the price the analysts saw) and the close the horizon number of trading days later (the exit), then grades the decision against the realized return:

- **BUY** is *aligned* when the return rose above the band
- **SELL** is *aligned* when the return fell below the band
- **HOLD** is *aligned* when the return stayed inside the band
- Anything else is *contrary*

The noise band exists so that ordinary day-to-day drift does not flip a verdict. A BUY followed by a 0.3% rise tells you nothing; the band filters that out.

Stub debates are never scored. Their decision is canned, so grading it would teach nothing and would pollute the statistics.

## Scoring outcomes

Click **Score new outcomes** on the Scorecard page. The engine fetches daily price history (one fetch per ticker) and writes an outcome row for every session whose horizon has matured. Sessions whose horizon has not matured yet show up as "still maturing" and are retried automatically the next time you score.

Scoring is idempotent: a session and horizon pair is graded exactly once, and re-clicking the button never changes an existing verdict.

## Reading the numbers

- **Aligned rate** is descriptive, not predictive. It tells you how often past output pointed the same way the market later moved, in your specific run history, with your specific providers and models. It says nothing about future market behavior.
- **Confidence calibration** is the most educational table on the page. It groups outcomes by the confidence the risk committee stated and shows the aligned rate inside each group. A well-calibrated committee is aligned more often when it says 85% than when it says 55%. A badly calibrated one is confidently wrong, which is worth knowing before you weigh its output.
- **By decision** splits the same data by BUY, SELL, and HOLD so you can spot systematic bias, for example a committee that is reasonable on BUY calls but poor on SELL calls.

## Housekeeping

- Outcomes live in the same local `data/sessions.db` file as your session history. Nothing leaves your machine except the price-history requests to your data provider.
- Deleting a session from History also removes its outcomes from the Scorecard.
- Price history comes from Yahoo Finance through yfinance. If a ticker cannot be fetched (delisted, rate limited, network offline), the refresh reports it and the rest of the queue still scores.

## A note on honesty

Trading Agents Lab shows aligned and contrary outcomes with equal weight on purpose. The lab is an educational tool: the most valuable thing the Scorecard can teach is where multi-agent LLM analysis goes wrong, not a highlight reel of where it went right. Past alignment carries no information about future results. Educational research only. Not investment advice.
