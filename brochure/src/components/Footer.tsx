import { Github } from 'lucide-react';
import { REPO_URL, ISSUES_URL, UPSTREAM_URL } from '../site';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a className="nav-brand" href="#top" aria-label="HedgeFund AI home">
              <span className="logo" aria-hidden="true">
                &#9670;
              </span>
              <span className="wordmark">
                HedgeFund <span className="accent">AI</span>
              </span>
            </a>
            <p>
              An open-source, multi-agent market research lab for your desktop. Built
              for learning, transparency, and understanding how language model agents
              reason together.
            </p>
          </div>

          <div className="footer-cols">
            <div className="footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#debate">The debate</a>
              <a href="#scorecard">Scorecard</a>
              <a href="#providers">Providers</a>
              <a href="#privacy">Your data</a>
            </div>
            <div className="footer-col">
              <h4>Project</h4>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">Issues</a>
              <a href={`${REPO_URL}/blob/main/README.md`} target="_blank" rel="noopener noreferrer">Documentation</a>
              <a href={UPSTREAM_URL} target="_blank" rel="noopener noreferrer">Upstream project</a>
            </div>
          </div>
        </div>

        <p className="disclaimer">
          <strong>Educational research only. Not investment advice.</strong>{' '}
          HedgeFund AI is an open-source research and learning tool. It is not a
          registered investment advisor, a broker, or a hedge fund, and it does not
          place orders or move money. It surfaces multiple large language model
          perspectives on tickers you choose, which can be incomplete or wrong.
          Nothing it produces is a recommendation to buy or sell any security or
          asset. Past analysis carries no information about future market behavior.
          Always do your own research and consult a licensed professional before
          making any financial decision.
        </p>

        <div className="footer-legal">
          <span>AGPL-3.0 licensed open source</span>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Github size={14} /> rjsx197047/HedgeFund_AI
          </a>
        </div>
      </div>
    </footer>
  );
}
