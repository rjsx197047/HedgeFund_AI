import { create } from 'zustand';
import { Views, RunStatuses, emptyRunSnapshot } from '@/types';
import type { LLMProvider, Run, RunStatus, View } from '@/types';
import { snapshotFromLive, useStore } from './useStore';

// ─────────────────────────────────────────────────────────────────────────────
// useSessionStore — multi-session lifecycle + view router.
//
// Owns: view (Home / Dashboard), run history (Run[]), the active run id.
// Coordinates with `useStore` (live display state) via `snapshotFromLive()`
// and `hydrate()`. The actual WebSocket plumbing comes in Day 2; this store
// exposes the lifecycle hooks (`startNewRun`, `endActiveRun`) the WS layer
// will call.
//
// No persistence on Day 1 — the engine's SQLite db is the source of truth
// for historical runs. The frontend's `runs` list is a cached view that
// gets re-fetched from `listSessions()` when the dashboard mounts.
// ─────────────────────────────────────────────────────────────────────────────

interface SessionState {
  view: View;
  runs: Run[];
  activeRunId: string | null;
  lastError: string | null;
}

interface SessionActions {
  goHome(): void;
  goToDashboard(): void;
  startNewRun(input: {
    ticker: string;
    tradeDate: string;
    provider: LLMProvider | null;
    model: string | null;
  }): void;
  selectRun(id: string): void;
  setRuns(runs: Run[]): void;
  endActiveRun(status?: RunStatus): void;
  clearError(): void;
}

type SessionStore = SessionState & SessionActions;

function freezeActiveIntoHistory(
  runs: Run[],
  activeRunId: string | null,
): Run[] {
  if (!activeRunId) return runs;
  const live = useStore.getState();
  return runs.map((r) =>
    r.id === activeRunId
      ? {
          ...r,
          status: live.status,
          ticker: live.ticker || r.ticker,
          endedAt: r.endedAt ?? new Date().toISOString(),
          snapshot: snapshotFromLive(),
        }
      : r,
  );
}

function buildEmptyRun(input: {
  ticker: string;
  tradeDate: string;
  provider: LLMProvider | null;
  model: string | null;
}): Run {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    ticker: input.ticker.toUpperCase(),
    tradeDate: input.tradeDate,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: RunStatuses.Running,
    snapshot: {
      ...emptyRunSnapshot(),
      provider: input.provider,
      model: input.model,
    },
  };
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
  view: Views.Home,
  runs: [],
  activeRunId: null,
  lastError: null,

  goHome: () => set({ view: Views.Home }),

  goToDashboard: () => set({ view: Views.Dashboard }),

  startNewRun: (input) => {
    const { runs, activeRunId } = get();
    const newRun = buildEmptyRun(input);

    // 1. Freeze the previously active run's live state into history before
    //    we clobber `useStore`.
    const frozen = freezeActiveIntoHistory(runs, activeRunId);

    // 2. Prepend the new run.
    const nextRuns = [newRun, ...frozen];

    // 3. Prime `useStore` for the new run.
    const live = useStore.getState();
    live.reset();
    live.setHeader({
      ticker: newRun.ticker,
      tradeDate: newRun.tradeDate,
      provider: input.provider,
      model: input.model,
    });
    live.setStatus(RunStatuses.Running);

    set({
      runs: nextRuns,
      activeRunId: newRun.id,
      view: Views.Dashboard,
      lastError: null,
    });
  },

  selectRun: (id) => {
    const { runs, activeRunId } = get();
    if (id === activeRunId) {
      set({ view: Views.Dashboard });
      return;
    }
    const target = runs.find((r) => r.id === id);
    if (!target) return;

    // Freeze the currently-active run before hydrating the picked one.
    const frozen = freezeActiveIntoHistory(runs, activeRunId);

    useStore.getState().hydrate(target);

    set({
      runs: frozen,
      activeRunId: id,
      view: Views.Dashboard,
    });
  },

  setRuns: (runs) => set({ runs }),

  endActiveRun: (status = RunStatuses.Completed) => {
    const { runs, activeRunId } = get();
    if (!activeRunId) return;
    const nextRuns = runs.map((r) =>
      r.id === activeRunId
        ? {
            ...r,
            status,
            endedAt: r.endedAt ?? new Date().toISOString(),
            snapshot: snapshotFromLive(),
          }
        : r,
    );
    useStore.getState().setStatus(status);
    set({ runs: nextRuns });
  },

  clearError: () => set({ lastError: null }),
}));

// ── Convenience selectors ───────────────────────────────────────────────────

export const useView = () => useSessionStore((s) => s.view);
export const useActiveRun = () => {
  const id = useSessionStore((s) => s.activeRunId);
  return useSessionStore((s) =>
    id ? s.runs.find((r) => r.id === id) ?? null : null,
  );
};
