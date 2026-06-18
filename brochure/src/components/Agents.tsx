const PHASES = [
  {
    step: 'Phase 1',
    title: 'Analysts',
    agents: ['Technical analyst', 'Fundamental analyst', 'News analyst', 'Sentiment analyst'],
  },
  {
    step: 'Phase 2',
    title: 'Researchers',
    agents: ['Bull researcher', 'Bear researcher', 'Research manager'],
  },
  {
    step: 'Phase 3',
    title: 'Trader',
    agents: ['Trader synthesizes the case', 'Drafts a proposed stance'],
  },
  {
    step: 'Phase 4',
    title: 'Risk committee',
    agents: ['Aggressive analyst', 'Conservative analyst', 'Neutral analyst', 'Risk manager decides'],
  },
];

export function Agents() {
  return (
    <section id="debate">
      <div className="container">
        <div className="section-head center reveal">
          <span className="eyebrow">How the debate works</span>
          <h2>Four phases, twelve perspectives, one transcript</h2>
          <p>
            Instead of a single model handing you an answer, HedgeFund AI stages a
            structured debate. Each agent has a role and a point of view. You watch
            them hand off, disagree, and converge, then you decide what to make of it.
          </p>
        </div>

        <div className="phases">
          {PHASES.map((p) => (
            <div className="phase reveal" key={p.step}>
              <span className="step">{p.step}</span>
              <h3>{p.title}</h3>
              <ul>
                {p.agents.map((a) => (
                  <li key={a}>
                    <span className="dot" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="stats reveal" style={{ marginTop: 28 }}>
          <div className="stat">
            <div className="num">12</div>
            <div className="lbl">specialized agents</div>
          </div>
          <div className="stat">
            <div className="num">4</div>
            <div className="lbl">debate phases</div>
          </div>
          <div className="stat">
            <div className="num">7+</div>
            <div className="lbl">LLM providers</div>
          </div>
          <div className="stat">
            <div className="num">100%</div>
            <div className="lbl">runs on your machine</div>
          </div>
        </div>
      </div>
    </section>
  );
}
