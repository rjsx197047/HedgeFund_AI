import { streamDebate, type StreamHandle } from '@/lib/engine-client';
import { routeEvent } from '@/lib/event-router';
import { pickProvider } from '@/lib/provider-select';
import { useSessionStore } from '@/store/useSessionStore';
import { useStore } from '@/store/useStore';
import { RunStatuses } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// startDebate — the orchestration entry point.
//
// 1. Pick the active provider (Ollama if reachable, else first key configured).
// 2. Snapshot a new run into useSessionStore (which atomically freezes any
//    previously-active run into history and primes useStore).
// 3. Open the WS to the engine; route every event through `routeEvent` so
//    useStore/useSessionStore stay consistent.
// 4. On close (clean or otherwise) drop the StreamHandle reference held by
//    the session store.
//
// Returns immediately with a `StartResult` reporting what happened. The
// caller (Home, Dashboard "Run again") shows an error in the dialog/banner
// when `ok` is false rather than navigating to the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export interface StartInput {
  ticker: string;
  tradeDate: string;
}

export type StartResult =
  | { ok: true; provider: string; model: string }
  | { ok: false; reason: 'no-provider' | 'engine-error'; message: string };

// Module-private — the active WS handle. Held outside the zustand store
// because the WebSocket object isn't serialisable + we never want it to
// trigger a React re-render.
let activeStream: StreamHandle | null = null;

export async function startDebate(input: StartInput): Promise<StartResult> {
  // Tear down any prior stream first so we don't leak.
  closeActiveStream();

  const selection = await pickProvider();
  if (!selection) {
    return {
      ok: false,
      reason: 'no-provider',
      message:
        'No LLM provider configured. Open Settings and either save an API key (OpenAI/Anthropic/Gemini/OpenRouter) or run Ollama locally.',
    };
  }

  // Push a fresh Run into history + view Dashboard.
  useSessionStore.getState().startNewRun({
    ticker: input.ticker,
    tradeDate: input.tradeDate,
    provider: selection.provider,
    model: selection.model,
  });

  try {
    const handle = await streamDebate(
      {
        ticker: input.ticker,
        trade_date: input.tradeDate,
        provider_config: selection.config,
      },
      routeEvent,
      (err) => {
        // Surface WS-level errors as a banner on the dashboard but don't
        // bubble — the engine usually emits a session.complete with the
        // error shape, or closes the WS with a non-1000 code which we
        // catch below.
        const message = err instanceof Error ? err.message : String(err);
        useStore.getState().setError(message);
      },
    );
    activeStream = handle;

    // When the WS closes (cleanly or otherwise), forget the handle. If the
    // engine errored without sending session.complete, mark the run as
    // errored so the sidebar pill is accurate.
    handle.done
      .then(() => {
        activeStream = null;
        // If we never got a session.complete the run is still "Running";
        // promote it to Aborted in that case so the user sees the truth.
        if (useStore.getState().status === RunStatuses.Running) {
          useSessionStore.getState().endActiveRun(RunStatuses.Aborted);
        }
      })
      .catch((err) => {
        activeStream = null;
        const message = err instanceof Error ? err.message : String(err);
        useStore.getState().setError(message);
        useSessionStore.getState().endActiveRun(RunStatuses.Errored);
      });

    return { ok: true, provider: selection.provider, model: selection.model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useStore.getState().setError(message);
    useSessionStore.getState().endActiveRun(RunStatuses.Errored);
    return { ok: false, reason: 'engine-error', message };
  }
}

/** Close the in-flight stream (if any) and mark the run aborted. Called by
 * the dashboard's stop button and on app shutdown. */
export function abortDebate(): void {
  if (!activeStream) return;
  activeStream.close();
  activeStream = null;
  useSessionStore.getState().endActiveRun(RunStatuses.Aborted);
}

/** Best-effort cleanup. Use when a fresh debate is being started and we
 * don't want the prior one's close-handler to fight us for state. */
export function closeActiveStream(): void {
  if (!activeStream) return;
  activeStream.close();
  activeStream = null;
}
