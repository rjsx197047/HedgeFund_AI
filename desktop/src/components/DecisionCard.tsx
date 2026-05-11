import { Coins, Loader2, MinusCircle, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store/useStore';
import { RunStatuses, type AnalyzeDecision } from '@/types';
import { cn, formatUsd } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// DecisionCard — final BUY / SELL / HOLD verdict with confidence + reasoning.
//
// Renders the placeholder "awaiting decision" tile while the run is still
// streaming, and the actual decision card after `session.complete`. Cost +
// token usage shows when present (i.e., API-key path; OAuth/Ollama paths
// emit zero cost which we surface as "—" or "Subscription/Local").
// ─────────────────────────────────────────────────────────────────────────────

export function DecisionCard() {
  const decision = useStore((s) => s.decision);
  const status = useStore((s) => s.status);
  const inputTokens = useStore((s) => s.inputTokens);
  const outputTokens = useStore((s) => s.outputTokens);
  const cost = useStore((s) => s.estimatedCostUsd);
  const provider = useStore((s) => s.provider);
  const model = useStore((s) => s.model);

  if (!decision && status !== RunStatuses.Running) return null;

  return (
    <Card
      className={cn(
        'transition-colors',
        decision && decisionTone(decision.action) === 'buy'
          ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
          : decision && decisionTone(decision.action) === 'sell'
            ? 'border-red-500/40 bg-red-500/[0.04]'
            : decision
              ? 'border-amber-500/40 bg-amber-500/[0.04]'
              : '',
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-amber-300" />
            <CardTitle>Portfolio decision</CardTitle>
          </div>
          {provider && model && (
            <Badge variant="info" className="font-mono">
              {provider}/{model}
            </Badge>
          )}
        </div>
        <CardDescription>
          Final recommendation from the portfolio manager.
        </CardDescription>
      </CardHeader>

      <div className="p-4 pt-0">
        {decision ? (
          <DecisionContent decision={decision} />
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-xs text-amber-200">
            <Loader2 className="size-4 animate-spin" />
            <div className="flex-1">
              <div className="font-semibold">Awaiting decision…</div>
              <div className="text-amber-200/80">
                The risk committee is still deliberating. The portfolio manager's
                BUY / SELL / HOLD call lands once all 12 agents have spoken.
              </div>
            </div>
          </div>
        )}

        {/* Cost + token footer — only on completed runs */}
        {decision && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <Stat
              label="Input tokens"
              value={inputTokens > 0 ? inputTokens.toLocaleString() : '—'}
            />
            <Stat
              label="Output tokens"
              value={outputTokens > 0 ? outputTokens.toLocaleString() : '—'}
            />
            <Stat
              label="Est. cost"
              value={costLabel(cost, provider)}
            />
          </div>
        )}

        <p className="mt-4 text-[10px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-400 font-semibold">Disclaimer.</span>{' '}
          Educational research only. Trading Agents Lab is not a registered
          investment advisor. LLM-generated analyses may be inaccurate or
          hallucinated. Nothing here is a recommendation to buy, sell, or
          hold any asset.
        </p>
      </div>
    </Card>
  );
}

function DecisionContent({ decision }: { decision: AnalyzeDecision }) {
  const tone = decisionTone(decision.action);
  const Icon =
    tone === 'buy' ? TrendingUp : tone === 'sell' ? TrendingDown : MinusCircle;
  const colorClass =
    tone === 'buy'
      ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
      : tone === 'sell'
        ? 'text-red-300 bg-red-500/15 border-red-500/30'
        : 'text-amber-200 bg-amber-500/15 border-amber-500/30';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-base font-semibold',
            colorClass,
          )}
        >
          <Icon className="size-4" />
          <span>{decision.action}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Confidence
          </span>
          <span className="font-mono text-sm text-zinc-100">
            {Math.round((decision.confidence || 0) * 100)}%
          </span>
        </div>
      </div>
      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {decision.reasoning}
      </p>
    </div>
  );
}

function decisionTone(action: string): 'buy' | 'sell' | 'hold' {
  const upper = (action || '').toUpperCase();
  if (upper === 'BUY') return 'buy';
  if (upper === 'SELL') return 'sell';
  return 'hold';
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-zinc-200 truncate flex items-center gap-1">
        {value}
      </div>
    </div>
  );
}

function costLabel(cost: number, provider: string | null): React.ReactNode {
  if (provider === 'ollama') return 'Local · $0';
  // OAuth/subscription paths bill $0 in the engine ledger because the cost
  // hits the user's subscription, not their API tier. Surface that as
  // "Subscription" rather than a literal $0 to avoid confusion.
  if (cost === 0 && provider === 'openai') return 'Subscription';
  if (cost === 0) return '—';
  return (
    <>
      <Coins className="size-3 text-amber-300" />
      {formatUsd(cost, 4)}
    </>
  );
}
