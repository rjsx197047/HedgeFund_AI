import { create } from 'zustand';
import type {
  AnalyzeDecision,
  DebateEvent,
  Headline,
  LLMProvider,
  QuoteSummary,
  Run,
  RunStatus,
} from '@/types';
import { RunStatuses, emptyRunSnapshot } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// useStore — live-display state for the currently-active run.
//
// The Dashboard reads from here. `useSessionStore.startNewRun` calls `reset()`
// + `setHeader()` to prime it; when the user picks a historical run from
// the sidebar, `hydrate()` swaps in that run's frozen snapshot. The WS event
// handler (Day 2) will append to `events` and patch `summary`/`headlines`/
// `decision` as the debate progresses.
// ─────────────────────────────────────────────────────────────────────────────

interface DisplayState {
  ticker: string;
  tradeDate: string;
  status: RunStatus;
  events: DebateEvent[];
  decision: AnalyzeDecision | null;
  summary: QuoteSummary | null;
  headlines: Headline[];
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  provider: LLMProvider | null;
  model: string | null;
  errorMessage: string | null;
}

interface DisplayActions {
  reset(): void;
  hydrate(run: Run): void;
  setHeader(input: {
    ticker: string;
    tradeDate: string;
    provider: LLMProvider | null;
    model: string | null;
  }): void;
  setStatus(status: RunStatus): void;
  appendEvent(event: DebateEvent): void;
  setSummary(summary: QuoteSummary | null): void;
  setHeadlines(headlines: Headline[]): void;
  setDecision(decision: AnalyzeDecision | null): void;
  setCosts(input: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
  }): void;
  setError(message: string | null): void;
}

type DisplayStore = DisplayState & DisplayActions;

const initial: DisplayState = {
  ticker: '',
  tradeDate: '',
  status: RunStatuses.Queued,
  events: [],
  decision: null,
  summary: null,
  headlines: [],
  inputTokens: 0,
  outputTokens: 0,
  estimatedCostUsd: 0,
  provider: null,
  model: null,
  errorMessage: null,
};

export const useStore = create<DisplayStore>()((set) => ({
  ...initial,

  reset: () => set({ ...initial }),

  hydrate: (run) =>
    set({
      ticker: run.ticker,
      tradeDate: run.tradeDate,
      status: run.status,
      events: run.snapshot.events,
      decision: run.snapshot.decision,
      summary: run.snapshot.summary,
      headlines: run.snapshot.headlines,
      inputTokens: run.snapshot.inputTokens,
      outputTokens: run.snapshot.outputTokens,
      estimatedCostUsd: run.snapshot.estimatedCostUsd,
      provider: run.snapshot.provider,
      model: run.snapshot.model,
      errorMessage: run.snapshot.errorMessage,
    }),

  setHeader: ({ ticker, tradeDate, provider, model }) =>
    set({ ticker, tradeDate, provider, model }),

  setStatus: (status) => set({ status }),

  appendEvent: (event) =>
    set((s) => ({ events: [...s.events, event] })),

  setSummary: (summary) => set({ summary }),

  setHeadlines: (headlines) => set({ headlines }),

  setDecision: (decision) => set({ decision }),

  setCosts: ({ inputTokens, outputTokens, estimatedCostUsd }) =>
    set((s) => ({
      inputTokens: inputTokens ?? s.inputTokens,
      outputTokens: outputTokens ?? s.outputTokens,
      estimatedCostUsd: estimatedCostUsd ?? s.estimatedCostUsd,
    })),

  setError: (errorMessage) => set({ errorMessage }),
}));

// ── Snapshot helpers ────────────────────────────────────────────────────────

/** Read the current live state and return it as an immutable RunSnapshot.
 * Used by `useSessionStore` to freeze the active run's state into history
 * when the user starts a new run or selects a different historical run. */
export function snapshotFromLive(): Run['snapshot'] {
  const s = useStore.getState();
  return {
    events: s.events,
    decision: s.decision,
    summary: s.summary,
    headlines: s.headlines,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    estimatedCostUsd: s.estimatedCostUsd,
    provider: s.provider,
    model: s.model,
    errorMessage: s.errorMessage,
  };
}

export { emptyRunSnapshot };
