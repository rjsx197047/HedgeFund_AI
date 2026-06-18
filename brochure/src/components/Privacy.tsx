import { ShieldCheck, WifiOff, HardDrive, EyeOff } from 'lucide-react';

const POINTS = [
  {
    icon: EyeOff,
    title: 'No accounts, no tracking',
    body: 'No sign up, no analytics SDKs, no telemetry, no install pings. There is nothing to opt out of because nothing is collected.',
  },
  {
    icon: HardDrive,
    title: 'Everything stays local',
    body: 'Your sessions, watchlist, and Scorecard live in a SQLite file next to the app. Your machine is the only copy.',
  },
  {
    icon: WifiOff,
    title: 'Only the calls you configure',
    body: 'The app reaches out solely to the data and model providers you set up yourself. Nothing else leaves the device.',
  },
  {
    icon: ShieldCheck,
    title: 'Keys in your keychain',
    body: 'API keys are encrypted by the operating system keychain (macOS Keychain) before they are written to disk.',
  },
];

export function Privacy() {
  return (
    <section id="privacy">
      <div className="container">
        <div className="section-head center reveal">
          <span className="eyebrow">Your data is yours</span>
          <h2>Private by design, not by policy</h2>
          <p>
            Privacy here is structural. The app is built so that your research simply
            cannot leak, because there is no server, no account, and no analytics in
            the first place.
          </p>
        </div>
        <div className="grid grid-2">
          {POINTS.map(({ icon: Icon, title, body }) => (
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
