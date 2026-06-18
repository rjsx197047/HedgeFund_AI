import { Target, GitCompare, Scale } from 'lucide-react';

export function Scorecard() {
  return (
    <section id="scorecard">
      <div className="container">
        <div className="split">
          <div className="split-media reveal">
            <img
              src="/shots/scorecard.png"
              alt="The Scorecard page grading past analyses at five and twenty trading days, with a by-decision breakdown and a confidence calibration table."
              loading="lazy"
              width={1280}
              height={800}
            />
          </div>
          <div className="reveal">
            <span className="eyebrow">The honest part</span>
            <h2>A Scorecard that grades itself</h2>
            <p>
              Most tools show you a confident answer and move on. HedgeFund AI keeps
              score. Every completed analysis is checked against what the market
              actually did afterward, so you can see where the committee was useful
              and where it was not.
            </p>
            <ul className="feat-list">
              <li>
                <Target className="icon" />
                <span>
                  <b>Scored at two horizons.</b> Each decision is graded at five and
                  twenty trading days against the realized price move, beyond a small
                  noise band so ordinary drift does not flip a verdict.
                </span>
              </li>
              <li>
                <Scale className="icon" />
                <span>
                  <b>Confidence calibration.</b> When the risk committee said eighty
                  five percent, how often was it actually aligned? The calibration
                  table makes over confidence visible.
                </span>
              </li>
              <li>
                <GitCompare className="icon" />
                <span>
                  <b>Aligned and contrary, equal weight.</b> The page is a learning
                  instrument, not a highlight reel. Past results say nothing about
                  future market behavior.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
