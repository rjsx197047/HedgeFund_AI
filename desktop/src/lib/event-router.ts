import type { DebateEvent, SessionCompleteEvent } from '@/lib/engine-client';
import { useSessionStore } from '@/store/useSessionStore';
import { useStore } from '@/store/useStore';
import { RunStatuses } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// event-router — translate engine DebateEvent into useStore + useSessionStore
// mutations.
//
// The WS layer calls `routeEvent(event)` for each frame the engine emits.
// We keep this in one place so the WS callsite stays a one-liner and the
// state mutations are auditable as a single switch statement.
// ─────────────────────────────────────────────────────────────────────────────

export function routeEvent(event: DebateEvent): void {
  const display = useStore.getState();

  // Always record the raw event so the dashboard can render a chronological
  // transcript of everything that happened (including phase markers).
  display.appendEvent(event);

  switch (event.type) {
    case 'session.start': {
      display.setStatus(RunStatuses.Running);
      display.setError(null);
      break;
    }
    case 'data.summary': {
      // Engine ships the QuoteSummary shape inline on the event; strip the
      // `type` field to get the QuoteSummary back out.
      const { type: _type, ...summary } = event;
      void _type;
      display.setSummary(summary);
      break;
    }
    case 'news.headlines': {
      display.setHeadlines(event.headlines);
      break;
    }
    case 'agent.message': {
      // No additional state mutation — the event is already in `events`
      // via the appendEvent call above, and DebateStream renders from
      // there. Surfaced as its own case for clarity / future hooks
      // (e.g. usage telemetry, current-speaker tracking).
      break;
    }
    case 'phase.transition': {
      // Same — recorded in `events`, no extra state needed yet.
      break;
    }
    case 'session.complete': {
      handleComplete(event);
      break;
    }
    case 'cost.blocked': {
      const session = useSessionStore.getState();
      display.setError(
        `Cost Guard blocked this debate (${event.over_dimension} cap reached). ${event.message}`,
      );
      session.endActiveRun(RunStatuses.Errored);
      break;
    }
  }
}

function handleComplete(event: SessionCompleteEvent): void {
  const display = useStore.getState();
  const session = useSessionStore.getState();

  display.setDecision(event.decision);
  display.setCosts({
    inputTokens: event.input_tokens,
    outputTokens: event.output_tokens,
    estimatedCostUsd: event.estimated_cost_usd,
  });
  session.endActiveRun(RunStatuses.Completed);
}
