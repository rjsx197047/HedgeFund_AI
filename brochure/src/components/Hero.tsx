import { Github, BookOpen } from 'lucide-react';
import { REPO_URL } from '../site';

export function Hero() {
  return (
    <section className="hero" id="hero">
      <div className="container">
        <span className="eyebrow">Open source, multi-agent market research</span>
        <h1>
          A boardroom of AI analysts, <span className="grad">debating every ticker you study</span>
        </h1>
        <p className="hero-sub">
          HedgeFund AI is a free, open-source desktop lab that runs a twelve-agent
          large language model debate across four phases (analysts, researchers,
          trader, risk committee) to surface multiple perspectives on a stock or
          crypto ticker. It is a research and learning tool. You bring your own AI
          key, your data stays on your machine, and nothing here is investment advice.
        </p>
        <div className="hero-cta">
          <a className="btn btn-primary btn-lg" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <Github className="icon-sm" size={18} />
            View on GitHub
          </a>
          <a className="btn btn-ghost btn-lg" href="#debate">
            <BookOpen className="icon-sm" size={18} />
            See how it works
          </a>
        </div>
        <p className="hero-meta">AGPL-3.0 &nbsp;&middot;&nbsp; macOS desktop app &nbsp;&middot;&nbsp; Bring your own AI key &nbsp;&middot;&nbsp; Runs locally</p>

        <figure className="shot reveal">
          <img
            src="/shots/analyze.png"
            alt="The HedgeFund AI desktop app showing the Analyze page where a ticker and trade date are entered to start a multi-agent debate."
            loading="eager"
            width={1280}
            height={800}
          />
        </figure>
        <p className="shot-cap">The desktop app. Pick a ticker and date, then watch the committee deliberate.</p>
      </div>
    </section>
  );
}
