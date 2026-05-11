import { useState } from 'react';
import { AlertTriangle, RefreshCw, Sparkles, StopCircle } from 'lucide-react';
import { DataCard } from '@/components/DataCard';
import { DebateStream } from '@/components/DebateStream';
import { DecisionCard } from '@/components/DecisionCard';
import { NewsCard } from '@/components/NewsCard';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { abortDebate, startDebate } from '@/lib/start-debate';
import { useActiveRun } from '@/store/useSessionStore';
import { useStore } from '@/store/useStore';
import { RunStatuses } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — top-level view while a run is active or being inspected.
//
// Layout:
//   ┌──────────────────────────────────────────────────────┐
//   │ TopBar (drag, brand, status pills, menus)            │
//   ├───────────────┬──────────────────────────────────────┤
//   │ Sidebar       │ Main panel:                          │
//   │  • New run    │  Header row (ticker, run controls)   │
//   │  • Run list   │  DataCard                            │
//   │               │  NewsCard                            │
//   │               │  DebateStream                        │
//   │               │  DecisionCard                        │
//   └───────────────┴──────────────────────────────────────┘
//
// Day 2 wires real WS-fed content into all four cards.
// ─────────────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeRun = useActiveRun();
  const status = useStore((s) => s.status);
  const errorMessage = useStore((s) => s.errorMessage);

  return (
    <div className="flex h-full w-full flex-col">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            aria-hidden
          >
            <div className="absolute top-[-10%] left-[-5%] h-[420px] w-[520px] rounded-full bg-amber-500/[0.04] blur-3xl" />
            <div className="absolute bottom-[10%] right-[5%] h-[320px] w-[420px] rounded-full bg-violet-500/[0.04] blur-3xl" />
          </div>

          {activeRun ? (
            <ActiveRunPanel
              ticker={activeRun.ticker}
              tradeDate={activeRun.tradeDate}
              running={status === RunStatuses.Running}
              errorMessage={errorMessage}
            />
          ) : (
            <EmptyState onOpenSettings={() => setSettingsOpen(true)} />
          )}
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

// ── Active run panel ────────────────────────────────────────────────────────

function ActiveRunPanel({
  ticker,
  tradeDate,
  running,
  errorMessage,
}: {
  ticker: string;
  tradeDate: string;
  running: boolean;
  errorMessage: string | null;
}) {
  const [rerunning, setRerunning] = useState(false);
  const hasSummary = useStore((s) => Boolean(s.summary));
  const hasHeadlines = useStore((s) => s.headlines.length > 0);
  const hasDecision = useStore((s) => Boolean(s.decision));

  const onRerun = async () => {
    if (rerunning) return;
    setRerunning(true);
    try {
      await startDebate({ ticker, tradeDate });
    } finally {
      setRerunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 animate-fade-in-up">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            {ticker}
          </h1>
          <span className="text-sm text-zinc-500 font-mono">{tradeDate}</span>
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => abortDebate()}
              title="Stop the debate (Cmd+.)"
            >
              <StopCircle className="size-4" />
              Stop
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRerun}
              disabled={rerunning}
              title="Run the debate again with the same ticker"
            >
              <RefreshCw className={rerunning ? 'size-4 animate-spin' : 'size-4'} />
              Run again
            </Button>
          )}
        </div>
      </header>

      {errorMessage && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-red-300" />
              <CardTitle className="text-red-200">Engine error</CardTitle>
            </div>
            <CardDescription className="text-red-300/80 whitespace-pre-wrap">
              {errorMessage}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* The four cards render themselves null when no data has arrived yet,
       * so this stays clean during the brief gap between "Running" and the
       * first data.summary event. */}
      <DataCard />
      <NewsCard />
      <DebateStream />
      <DecisionCard />

      {/* When the run is still warming up (no summary, no headlines, no
       * messages, no decision), give the user a friendly waiting state
       * instead of an empty page. */}
      {!hasSummary && !hasHeadlines && !hasDecision && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-300" />
              <CardTitle>Warming up…</CardTitle>
            </div>
            <CardDescription>
              Connecting to the engine and fetching market data for {ticker}.
              The debate transcript will stream in here as agents finish.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <div className="text-center max-w-md">
        <div className="mx-auto size-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 grid place-items-center mb-4">
          <Sparkles className="size-5 text-amber-300" />
        </div>
        <h2 className="text-base font-semibold text-zinc-100">
          No active debate
        </h2>
        <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
          Pick a past run from the sidebar to replay it, or click{' '}
          <span className="text-zinc-300">New analysis</span> to start a new
          one. First time? Open{' '}
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-amber-300 underline-offset-2 hover:underline"
          >
            Settings
          </button>{' '}
          and configure a provider.
        </p>
      </div>
    </div>
  );
}
