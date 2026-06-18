import {
  Users,
  LineChart,
  ClipboardCheck,
  Wallet,
  Newspaper,
  Cpu,
  Webhook,
  Send,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Users,
    title: 'Twelve-agent debate',
    body: 'Four analysts, a bull and bear researcher, a trader, and a four-member risk committee each argue their view before a decision is reached. You read the whole transcript.',
  },
  {
    icon: ClipboardCheck,
    title: 'Honest Scorecard',
    body: 'Every past analysis is graded against what the market actually did at five and twenty trading days, including confidence calibration. Aligned and contrary results carry equal weight.',
  },
  {
    icon: Cpu,
    title: 'Local or cloud models',
    body: 'Run entirely offline with Ollama or LM Studio, or connect OpenAI, Anthropic, Google Gemini, xAI Grok, MiniMax, or OpenRouter. The choice is yours.',
  },
  {
    icon: LineChart,
    title: 'Real market data',
    body: 'Pulls daily price history and headlines from Yahoo Finance for free, with optional Alpaca data keys. Equities and crypto tickers are both supported.',
  },
  {
    icon: Newspaper,
    title: 'News and sentiment',
    body: 'A sentiment analyst folds in recent headlines plus StockTwits and Reddit chatter, so the debate reflects the current narrative around a ticker.',
  },
  {
    icon: Wallet,
    title: 'Cost Guard',
    body: 'Set daily, weekly, and monthly spending caps plus a per-day run limit. Every cloud run is estimated and reserved before it starts, so a debate never surprises your bill.',
  },
  {
    icon: Send,
    title: 'Telegram companion',
    body: 'Kick off a debate and receive the streamed result from a private Telegram bot, paired to your own account, when you are away from the desk.',
  },
  {
    icon: Webhook,
    title: 'Outbound webhooks',
    body: 'Push a finished analysis to Slack, Discord, Telegram, or your own HTTPS endpoint. The result goes where you work. Execution stays on your own regulated platform.',
  },
];

export function Features() {
  return (
    <section id="features">
      <div className="container">
        <div className="section-head center reveal">
          <span className="eyebrow">What it does</span>
          <h2>A full research desk, on your desktop</h2>
          <p>
            HedgeFund AI brings together multi-agent analysis, real data, honest
            self-scoring, and strong privacy in one open-source app you control end to end.
          </p>
        </div>
        <div className="grid grid-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article className="card reveal" key={title}>
              <span className="card-ico">
                <Icon className="icon" />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
