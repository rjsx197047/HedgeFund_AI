// ─────────────────────────────────────────────────────────────────────────────
// types.ts — shared frontend types.
//
// We keep these UI-facing types separate from the wire types in
// `lib/engine-client.ts`. The engine speaks snake_case; the UI speaks
// camelCase. Conversions happen at the lib/ boundary so React components
// only ever see the camelCase shape.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalyzeDecision,
  DebateEvent,
  Headline,
  LLMProvider,
  QuoteSummary,
} from '@/lib/engine-client';

// ── Views ───────────────────────────────────────────────────────────────────

export const Views = {
  Home: 'home',
  Dashboard: 'dashboard',
} as const;

export type View = (typeof Views)[keyof typeof Views];

// ── Run status ──────────────────────────────────────────────────────────────

export const RunStatuses = {
  Queued: 'queued',
  Running: 'running',
  Completed: 'completed',
  Errored: 'errored',
  Aborted: 'aborted',
} as const;

export type RunStatus = (typeof RunStatuses)[keyof typeof RunStatuses];

// ── Run snapshot ────────────────────────────────────────────────────────────

/** Snapshot of everything we want to render for a run, regardless of whether
 * it's live or historical. Frozen onto `Run.snapshot` when the run ends,
 * mirrored into `useStore` while the run is active. */
export interface RunSnapshot {
  events: DebateEvent[];
  decision: AnalyzeDecision | null;
  summary: QuoteSummary | null;
  headlines: Headline[];
  /** Tokens + estimated cost when available; null on stub runs. */
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  /** Provider/model that produced the run (null on stub). */
  provider: LLMProvider | null;
  model: string | null;
  /** Last error surfaced to the UI, if any. */
  errorMessage: string | null;
}

export function emptyRunSnapshot(): RunSnapshot {
  return {
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
}

// ── Run ─────────────────────────────────────────────────────────────────────

export interface Run {
  id: string;
  ticker: string;
  tradeDate: string;
  startedAt: string;
  endedAt: string | null;
  status: RunStatus;
  snapshot: RunSnapshot;
}

// ── Re-exports for convenience in components ────────────────────────────────

export type {
  AnalyzeDecision,
  DebateEvent,
  Headline,
  LLMProvider,
  QuoteSummary,
};
