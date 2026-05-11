import { useState } from 'react';
import { Activity, AlertTriangle, Sparkles } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveRun } from '@/store/useSessionStore';
import { useStore } from '@/store/useStore';
import { RunStatuses } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — main view once a run is active.
//
// Day 1 layout:
//   ┌──────────────────────────────────────────────────────┐
//   │ TopBar (drag region, brand, status pills, menus)     │
//   ├───────────────┬──────────────────────────────────────┤
//   │ Sidebar       │ Main area (debate stream — Day 2)    │
//   │  • New run    │                                      │
//   │  • Run list   │  Placeholder card for now.           │
//   │               │                                      │
//   └───────────────┴──────────────────────────────────────┘
//
// Day 2 replaces the placeholder with the WS-fed `DebateStream` and the
// data/news cards.
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
          {/* Same ambient orbs as Home but dialed down. */}
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
            <EmptyState />
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

// ── Active run placeholder (Day 2 wires the real stream) ───────────────────

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
  return (
    <div className="flex flex-col gap-4 p-6 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          {ticker}
        </h1>
        <span className="text-sm text-zinc-500 font-mono">{tradeDate}</span>
      </div>

      {errorMessage && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-red-300" />
              <CardTitle className="text-red-200">Engine error</CardTitle>
            </div>
            <CardDescription className="text-red-300/80">
              {errorMessage}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-300" />
            <CardTitle>Debate stream</CardTitle>
          </div>
          <CardDescription>
            The 12-agent live debate renders here. Day 1 ships the shell;
            the WebSocket integration that fills this panel with{' '}
            <code className="px-1 py-0.5 bg-zinc-800/80 rounded text-zinc-300">
              agent.message
            </code>{' '}
            events lands Day 2.
          </CardDescription>
        </CardHeader>
        <div className="p-4 pt-0">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-6 text-center">
            <Activity
              className={
                running
                  ? 'mx-auto size-6 text-amber-300 animate-pulse-soft'
                  : 'mx-auto size-6 text-zinc-600'
              }
            />
            <p className="mt-3 text-sm text-zinc-300">
              {running
                ? 'Debate scheduled — engine wire-up arrives next.'
                : 'Idle. Pick a ticker from the sidebar or hit New analysis.'}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {running
                ? 'Day 2 stream the 4 phases live (analysts → researchers → trader → risk committee).'
                : 'Day 2: live agent messages with phase markers and the final decision card.'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function EmptyState() {
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
          one.
        </p>
      </div>
    </div>
  );
}
