import {
  getSession,
  listSessions,
  type LLMProvider,
  type SessionDetail,
  type SessionSummary,
} from '@/lib/engine-client';
import { useSessionStore } from '@/store/useSessionStore';
import { useStore } from '@/store/useStore';
import { RunStatuses, type Run } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// session-hydrate — bridge engine /sessions storage into the renderer's
// zustand cache.
//
// On Dashboard mount we call `loadHistory()` to fetch the recent N sessions
// and merge them into useSessionStore.runs. We keep already-running /
// in-flight runs untouched (they live in zustand only, no engine row yet)
// and merge by ticker+startedAt when there's a collision.
//
// When the user picks an older run from the sidebar (selectRun), useStore
// is hydrated from that Run's frozen snapshot. If the snapshot's `events`
// is empty (which it is for everything fetched from /sessions since we only
// took the summary), call `loadRunDetail()` to backfill the transcript.
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_SET = new Set<LLMProvider>([
  'openai',
  'anthropic',
  'openrouter',
  'gemini',
  'ollama',
]);

function toProvider(value: string | null): LLMProvider | null {
  if (!value) return null;
  return PROVIDER_SET.has(value as LLMProvider) ? (value as LLMProvider) : null;
}

function summaryToRun(s: SessionSummary): Run {
  return {
    id: s.id,
    ticker: s.ticker,
    tradeDate: s.trade_date,
    startedAt: s.created_at,
    endedAt: s.created_at,
    status: RunStatuses.Completed,
    snapshot: {
      events: [],
      decision: {
        action: s.decision_action,
        confidence: s.decision_confidence,
        reasoning: s.decision_reasoning,
      },
      summary: null,
      headlines: [],
      inputTokens: s.input_tokens ?? 0,
      outputTokens: s.output_tokens ?? 0,
      estimatedCostUsd: s.estimated_cost_usd ?? 0,
      provider: toProvider(s.provider),
      model: s.model,
      errorMessage: null,
    },
  };
}

function detailToRun(d: SessionDetail): Run {
  // Walk events to pull the data.summary + news.headlines back out so the
  // historic Dashboard view has the same cards a live debate does.
  let summary: Run['snapshot']['summary'] = null;
  let headlines: Run['snapshot']['headlines'] = [];
  for (const evt of d.events) {
    if (evt.type === 'data.summary') {
      const { type: _type, ...rest } = evt;
      void _type;
      summary = rest;
    } else if (evt.type === 'news.headlines') {
      headlines = evt.headlines;
    }
  }
  return {
    ...summaryToRun(d),
    snapshot: {
      ...summaryToRun(d).snapshot,
      events: d.events,
      summary,
      headlines,
    },
  };
}

/** Fetch the engine's recent N sessions and merge them into useSessionStore.
 * Best-effort: errors are swallowed and surfaced via lastError on the store. */
export async function loadHistory(limit = 50): Promise<void> {
  try {
    const summaries = await listSessions({ limit });
    const fetched = summaries.map(summaryToRun);
    const session = useSessionStore.getState();

    // Merge with anything already in the store (e.g. an in-flight active run).
    // Existing runs by id win — they have richer state. Append the engine
    // rows we don't already have. Sort newest-first by startedAt.
    const existing = new Map(session.runs.map((r) => [r.id, r]));
    const merged: Run[] = [...session.runs];
    for (const r of fetched) {
      if (!existing.has(r.id)) merged.push(r);
    }
    merged.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    session.setRuns(merged);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useStore.getState().setError(`history load failed: ${message}`);
  }
}

/** Fetch the full detail (events array) for a single run if we don't have it
 * cached yet, and re-hydrate useStore from the result. Called by the sidebar
 * `selectRun` when the picked run has no events in its snapshot. */
export async function loadRunDetail(runId: string): Promise<void> {
  const session = useSessionStore.getState();
  const run = session.runs.find((r) => r.id === runId);
  if (!run) return;
  if (run.snapshot.events.length > 0) return;

  try {
    const detail = await getSession(runId);
    const hydrated = detailToRun(detail);

    // Replace the cached run with the richer version and re-hydrate the
    // live store from it (only if it's still the active run).
    const replaced = session.runs.map((r) => (r.id === runId ? hydrated : r));
    session.setRuns(replaced);

    if (session.activeRunId === runId) {
      useStore.getState().hydrate(hydrated);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useStore.getState().setError(`session detail load failed: ${message}`);
  }
}
