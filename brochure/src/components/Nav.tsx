import { useState } from 'react';
import { Github, Menu } from 'lucide-react';
import { REPO_URL } from '../site';

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className={`nav${open ? ' open' : ''}`} id="nav">
      <div className="container nav-inner">
        <a
          className="nav-brand"
          href="#top"
          aria-label="HedgeFund AI home"
          onClick={() => setOpen(false)}
        >
          <span className="logo" aria-hidden="true">
            &#9670;
          </span>
          <span className="wordmark">
            HedgeFund <span className="accent">AI</span>
          </span>
        </a>

        <nav className="nav-links" aria-label="Primary" onClick={() => setOpen(false)}>
          <a className="navlink" href="#features">Features</a>
          <a className="navlink" href="#debate">The debate</a>
          <a className="navlink" href="#scorecard">Scorecard</a>
          <a className="navlink" href="#providers">Providers</a>
          <a className="navlink" href="#get-started">Get started</a>
        </nav>

        <div className="nav-cta">
          <a
            className="btn btn-primary"
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="icon-sm" size={16} />
            <span className="hide-sm">GitHub</span>
          </a>
          <button
            className="nav-toggle"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Menu className="icon" />
          </button>
        </div>
      </div>
    </header>
  );
}
