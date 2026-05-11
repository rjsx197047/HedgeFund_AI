import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Bitcoin,
  Loader2,
  Settings as SettingsIcon,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsDialog } from '@/components/SettingsDialog';
import { useSessionStore } from '@/store/useSessionStore';
import { useStore } from '@/store/useStore';
import { RunStatuses } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Home — landing page.
//
// Single job: capture a ticker (equity or crypto) and hand off to the
// dashboard via `useSessionStore.startNewRun`. The store atomically
// (a) snapshots any in-flight run into history, (b) creates the new Run,
// (c) primes `useStore` with empty live state, and (d) flips view to
// Dashboard. There is no out-of-band navigation here.
//
// Visual language matches the AI QA Engineer family — ambient orange/violet
// gradient orbs, blurred card surfaces, soft entrance animations. The accent
// is brand-orange because that's TradingAgentsLab's lock-in accent (vs the
// QA tool's blue).
// ─────────────────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

export function Home() {
  const startNewRun = useSessionStore((s) => s.startNewRun);
  const goToDashboard = useSessionStore((s) => s.goToDashboard);
  const activeRunId = useSessionStore((s) => s.activeRunId);
  const runs = useSessionStore((s) => s.runs);
  const liveStatus = useStore((s) => s.status);

  const [ticker, setTicker] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeRunning =
    liveStatus === RunStatuses.Running &&
    runs.some((r) => r.id === activeRunId && r.status === RunStatuses.Running);
  const activeRun = runs.find((r) => r.id === activeRunId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = ticker.trim().toUpperCase();
    if (!cleaned || isStarting) return;

    setIsStarting(true);
    // Day 1: the WS integration ships Day 2. For now we just transition the
    // session store; the dashboard will render the run header + a "waiting
    // for engine wire-up" placeholder.
    startNewRun({
      ticker: cleaned,
      tradeDate: TODAY,
      provider: null,
      model: null,
    });
    setIsStarting(false);
  };

  return (
    <div className="relative min-h-full flex flex-col items-center justify-center px-6 py-16 overflow-hidden flex-1">
      {/* Ambient backdrop — orange/violet/amber orbs to keep the dark surface
       * from feeling flat. `pointer-events-none -z-10` so they never intercept
       * clicks. */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 h-[420px] w-[720px] rounded-full bg-amber-500/10 blur-3xl animate-orbit-slow" />
        <div className="absolute top-[40%] left-1/3 h-[320px] w-[420px] rounded-full bg-violet-500/8 blur-3xl" />
        <div className="absolute bottom-[10%] right-[10%] h-[280px] w-[380px] rounded-full bg-fuchsia-500/5 blur-3xl" />
      </div>

      {/* Settings gear — top-right. Same SettingsDialog the Dashboard uses. */}
      <Button
        type="button"
        variant="icon"
        size="icon"
        onClick={() => setSettingsOpen(true)}
        title="Settings (provider, API keys, model)"
        aria-label="Open settings"
        className="absolute top-4 right-4 app-no-drag"
      >
        <SettingsIcon className="size-4" />
      </Button>

      {/* Brand mark */}
      <div className="flex items-center gap-2 mb-10 animate-fade-in-up">
        <div className="size-8 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 grid place-items-center shadow-lg shadow-amber-500/20">
          <Sparkles className="size-4 text-zinc-950" />
        </div>
        <span className="text-sm font-semibold text-zinc-200 tracking-wide">
          Trading Agents Lab
        </span>
      </div>

      {/* Resume-pill — surfaces an in-flight debate so the user knows
       * something's running even after navigating Home. */}
      {activeRunning && activeRun && (
        <button
          type="button"
          onClick={goToDashboard}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/15 transition-colors animate-fade-in-up app-no-drag"
          title="A debate is in progress — click to view"
        >
          <Loader2 className="size-3.5 animate-spin" />
          <span className="font-medium">Debate in progress</span>
          <span className="text-amber-200/60 font-mono truncate max-w-[260px]">
            {activeRun.ticker} · {activeRun.tradeDate}
          </span>
          <ArrowRight className="size-3" />
        </button>
      )}

      {/* Title + motto */}
      <h1 className="text-center text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-50 max-w-3xl leading-[1.05] animate-fade-in-up">
        Multi-Agent Trading Lab
      </h1>
      <p className="mt-6 text-center text-zinc-400 text-base sm:text-lg max-w-xl leading-relaxed animate-fade-in-up">
        Watch 12 specialised LLM agents debate a ticker and produce a
        transparent, auditable trade thesis.
      </p>

      {/* Ticker form */}
      <form
        onSubmit={onSubmit}
        className="mt-12 w-full max-w-2xl animate-fade-in-up app-no-drag"
      >
        <div className="group flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-xl px-4 py-3 transition-all duration-150 focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:shadow-lg focus-within:shadow-amber-500/10">
          <TrendingUp className="size-5 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="NVDA  ·  AAPL  ·  BTC  ·  ETH  ·  BTC/USD"
            className="flex-1 bg-transparent outline-none text-base text-zinc-100 placeholder:text-zinc-600 font-mono uppercase tracking-wide"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={16}
          />
          <Button
            type="submit"
            size="default"
            disabled={!ticker.trim() || isStarting}
            className="rounded-xl min-w-[120px]"
          >
            {isStarting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                Analyze
                <ArrowUp className="size-4" />
              </>
            )}
          </Button>
        </div>
        <p className="mt-3 text-xs text-zinc-500 text-center">
          Press{' '}
          <kbd className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-zinc-300 text-[10px] font-mono">
            Enter
          </kbd>{' '}
          to start the debate. Crypto tickers (BTC, ETH, SOL…) auto-route to
          the crypto endpoint.
        </p>
      </form>

      {/* Feature pills */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl w-full animate-fade-in-up">
        <FeaturePill
          icon={<Sparkles className="size-3.5 text-amber-300" />}
          title="Debates"
          body="12 agents across analyst → researcher → trader → risk committee."
        />
        <FeaturePill
          icon={<TrendingUp className="size-3.5 text-sky-300" />}
          title="Live data"
          body="yfinance default, Alpaca Markets SIP feed when keys are set."
        />
        <FeaturePill
          icon={<Bitcoin className="size-3.5 text-fuchsia-300" />}
          title="Stocks + crypto"
          body="Asset-class aware prompts. Local LLMs via Ollama supported."
        />
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function FeaturePill({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm p-4 transition-colors hover:border-zinc-700/80">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200 mb-1">
        {icon}
        <span>{title}</span>
      </div>
      <div className="text-xs text-zinc-500 leading-relaxed">{body}</div>
    </div>
  );
}
