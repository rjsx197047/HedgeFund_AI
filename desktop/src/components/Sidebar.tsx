import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSessionStore } from '@/store/useSessionStore';
import { loadRunDetail } from '@/lib/session-hydrate';
import { relativeTime } from '@/lib/utils';
import { RunStatuses, type Run, type RunStatus } from '@/types';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — past + active runs.
//
// "New analysis" button at the top brings the user back to Home. Each run
// row shows ticker + trade date + relative time + a status pill. Active
// run is highlighted with a brand-orange left border.
// ─────────────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const runs = useSessionStore((s) => s.runs);
  const activeRunId = useSessionStore((s) => s.activeRunId);
  const goHome = useSessionStore((s) => s.goHome);
  const selectRun = useSessionStore((s) => s.selectRun);

  const onPickRun = (id: string) => {
    selectRun(id);
    // Lazy-load the full event transcript for historical runs that came from
    // /sessions (their snapshot only has the decision; events[] is empty).
    // No-op if events are already present.
    void loadRunDetail(id);
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/40">
      <div className="p-3 border-b border-zinc-800/80">
        <Button
          variant="secondary"
          size="default"
          className="w-full justify-start"
          onClick={goHome}
        >
          <Plus className="size-4" />
          New analysis
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {runs.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-zinc-500 leading-relaxed">
              Past debates appear here.
              <br />
              Click <span className="text-zinc-300">New analysis</span> to
              start one.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                active={run.id === activeRunId}
                onClick={() => onPickRun(run.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-800/80 p-3 text-[10px] text-zinc-600 leading-relaxed">
        <span className="text-zinc-400 font-medium">Educational research only.</span>{' '}
        Not a registered investment advisor. Not investment advice.
      </div>
    </aside>
  );
}

function RunRow({
  run,
  active,
  onClick,
}: {
  run: Run;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'group flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-colors',
          active
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900/40',
        )}
      >
        <div className="flex w-full items-center gap-2">
          <span
            className={cn(
              'text-xs font-semibold font-mono tracking-wide',
              active ? 'text-amber-200' : 'text-zinc-100',
            )}
          >
            {run.ticker}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">
            {run.tradeDate}
          </span>
          <div className="flex-1" />
          <StatusPill status={run.status} />
        </div>
        <div className="flex w-full items-center gap-2 text-[10px] text-zinc-500">
          <span>{relativeTime(run.startedAt)}</span>
          {run.snapshot.provider && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="truncate">{run.snapshot.provider}</span>
            </>
          )}
        </div>
      </button>
    </li>
  );
}

function StatusPill({ status }: { status: RunStatus }) {
  if (status === RunStatuses.Running) {
    return <Badge variant="warning">Running</Badge>;
  }
  if (status === RunStatuses.Completed) {
    return <Badge variant="success">Done</Badge>;
  }
  if (status === RunStatuses.Errored) {
    return <Badge variant="danger">Error</Badge>;
  }
  if (status === RunStatuses.Aborted) {
    return <Badge variant="neutral">Aborted</Badge>;
  }
  return <Badge variant="neutral">Queued</Badge>;
}
