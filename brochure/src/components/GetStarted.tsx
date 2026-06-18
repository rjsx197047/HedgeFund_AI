import { Github, TerminalSquare } from 'lucide-react';
import { REPO_URL, REPO_CLONE_URL } from '../site';

const STEPS = [
  {
    n: '01',
    title: 'Clone the repo',
    body: 'Grab the source from GitHub. The desktop app and the Python analysis engine both live in one repository.',
  },
  {
    n: '02',
    title: 'Install and run',
    body: 'Create the engine virtual environment, install the desktop dependencies, and start the dev stack with a single npm command.',
  },
  {
    n: '03',
    title: 'Add a model and analyze',
    body: 'Point it at a local runtime or paste a provider key in Settings, type a ticker, and watch the committee debate it.',
  },
];

export function GetStarted() {
  return (
    <section id="get-started">
      <div className="container">
        <div className="section-head center reveal">
          <span className="eyebrow">Get started</span>
          <h2>Free, open source, and yours to run</h2>
          <p>
            HedgeFund AI is AGPL-3.0 licensed with no paywall and no premium tier.
            Clone it, read it, and run it. The codebase is written to be studied as
            much as used.
          </p>
        </div>

        <div className="terminal reveal">
          <div className="terminal-bar">
            <span className="tdot r" />
            <span className="tdot y" />
            <span className="tdot g" />
            <span className="tname">
              <TerminalSquare size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              bash
            </span>
          </div>
          <pre>
            <code>
              <span className="c-comment"># 1. Clone the open-source repo</span>
              {'\n'}
              <span className="c-cmd">git clone {REPO_CLONE_URL}</span>
              {'\n'}
              <span className="c-cmd">cd HedgeFund_AI/desktop</span>
              {'\n\n'}
              <span className="c-comment"># 2. Install desktop dependencies</span>
              {'\n'}
              <span className="c-cmd">npm install</span>
              {'\n\n'}
              <span className="c-comment"># 3. Launch the app (spawns the Python engine for you)</span>
              {'\n'}
              <span className="c-cmd">npm run dev</span>
            </code>
          </pre>
        </div>

        <div className="steps">
          {STEPS.map((s) => (
            <div className="step-card reveal" key={s.n}>
              <span className="n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>

        <div className="cta reveal" style={{ marginTop: 56 }}>
          <h2>Read the source. Run the debate. Keep score.</h2>
          <p>
            HedgeFund AI is a research and learning tool for studying multi-agent
            large language model design and market analysis. It is not investment advice.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <Github className="icon-sm" size={18} />
              Open the GitHub repo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
