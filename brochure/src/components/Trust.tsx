import { Lock, Code2, KeyRound, GraduationCap, MonitorDown } from 'lucide-react';

const ITEMS = [
  { icon: Code2, label: 'Open source (AGPL-3.0)' },
  { icon: KeyRound, label: 'Bring your own AI key' },
  { icon: Lock, label: 'Zero data collection' },
  { icon: MonitorDown, label: 'Runs on your machine' },
  { icon: GraduationCap, label: 'Educational research only' },
];

export function Trust() {
  return (
    <div className="trust">
      <div className="container">
        <div className="trust-row">
          {ITEMS.map(({ icon: Icon, label }) => (
            <span className="trust-item" key={label}>
              <Icon className="icon icon-sm" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
