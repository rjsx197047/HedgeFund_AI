import { ArrowDownRight, ArrowUpRight, BarChart3, Minus } from 'lucide-react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// DataCard — renders the quote summary the engine emits early in the debate
// (the `data.summary` event). Reads from useStore.summary. Renders nothing
// when no summary has arrived yet.
// ─────────────────────────────────────────────────────────────────────────────

export function DataCard() {
  const summary = useStore((s) => s.summary);
  if (!summary) return null;

  const positive = summary.period_change_pct > 0;
  const negative = summary.period_change_pct < 0;
  const Arrow = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-sky-300" />
            <CardTitle>Market data</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {summary.asset_class && (
              <Badge variant="info" className="capitalize">
                {summary.asset_class}
              </Badge>
            )}
            <Badge variant="neutral">{summary.source}</Badge>
          </div>
        </div>
        <CardDescription>
          As of {summary.as_of} · {summary.sessions} sessions
        </CardDescription>
      </CardHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 pt-0">
        <Metric label="Last close" value={fmtUsd(summary.last_close)} />
        <Metric
          label="Period change"
          value={`${summary.period_change_pct.toFixed(2)}%`}
          tone={positive ? 'positive' : negative ? 'negative' : 'neutral'}
          icon={
            <Arrow
              className={cn(
                'size-3.5',
                positive
                  ? 'text-emerald-300'
                  : negative
                    ? 'text-red-300'
                    : 'text-zinc-400',
              )}
            />
          }
        />
        <Metric label="Period open" value={fmtUsd(summary.period_open)} />
        <Metric
          label="High / Low"
          value={`${fmtUsd(summary.period_high)} / ${fmtUsd(summary.period_low)}`}
        />
        <Metric
          label="Avg volume"
          value={fmtVolume(summary.avg_volume)}
          className="col-span-2"
        />
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: 'positive' | 'negative' | 'neutral';
  className?: string;
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-300'
      : tone === 'negative'
        ? 'text-red-300'
        : 'text-zinc-100';
  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-800/80 bg-zinc-950/30 px-3 py-2',
        className,
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={cn('mt-0.5 flex items-center gap-1 text-sm font-mono', toneClass)}>
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) {
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  return `$${n.toFixed(2)}`;
}

function fmtVolume(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString();
}
