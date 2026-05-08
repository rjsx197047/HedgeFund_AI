export interface EngineHandshake {
  port: number;
  token: string;
}

export interface AnalyzeRequest {
  ticker: string;
  trade_date: string;
}

export interface AnalyzeDecision {
  action: 'BUY' | 'SELL' | 'HOLD' | string;
  confidence: number;
  reasoning: string;
}

export interface AnalyzeResponse {
  ok: boolean;
  ticker: string;
  trade_date: string;
  decision: AnalyzeDecision;
  agents: unknown[];
}

export interface QuoteSummary {
  ticker: string;
  trade_date: string;
  as_of: string;
  last_close: number;
  period_open: number;
  period_high: number;
  period_low: number;
  period_change_pct: number;
  avg_volume: number;
  sessions: number;
  source: string;
}

export type DebateEvent =
  | { type: 'session.start'; ticker: string; trade_date: string }
  | ({ type: 'data.summary' } & QuoteSummary)
  | { type: 'agent.message'; agent: string; phase: string; content: string }
  | { type: 'phase.transition'; from: string; to: string }
  | {
      type: 'session.complete';
      ticker: string;
      trade_date: string;
      decision: AnalyzeDecision;
    };

export interface StreamHandle {
  close(): void;
  done: Promise<void>;
}

let cachedHandshake: EngineHandshake | null = null;

async function handshake(): Promise<EngineHandshake> {
  if (cachedHandshake) return cachedHandshake;
  if (!window.tradingAgentsLab?.getEngineHandshake) {
    throw new Error('engine bridge not available — preload not loaded');
  }
  const result = await window.tradingAgentsLab.getEngineHandshake();
  cachedHandshake = result;
  return result;
}

export async function getHandshake(): Promise<EngineHandshake> {
  return handshake();
}

export async function analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const { port, token } = await handshake();
  const res = await fetch(`http://127.0.0.1:${port}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`analyze failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AnalyzeResponse;
}

export async function streamDebate(
  req: AnalyzeRequest,
  onEvent: (event: DebateEvent) => void,
  onError?: (err: unknown) => void,
): Promise<StreamHandle> {
  const { port, token } = await handshake();
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/stream?token=${encodeURIComponent(token)}`,
  );

  let resolveDone: () => void;
  let rejectDone: (err: unknown) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify(req));
  });

  ws.addEventListener('message', (msg) => {
    try {
      const parsed = JSON.parse(msg.data as string) as DebateEvent;
      onEvent(parsed);
    } catch (err) {
      onError?.(err);
    }
  });

  ws.addEventListener('error', (event) => {
    onError?.(event);
  });

  ws.addEventListener('close', (event) => {
    if (event.code === 1000) {
      resolveDone();
    } else if (event.code === 1005) {
      // 1005 = no status received — treat as clean if server closed before
      // browser saw the close frame. Server explicitly sends 1000, so this
      // path is only hit on edge timing.
      resolveDone();
    } else {
      rejectDone(new Error(`stream closed with code ${event.code}: ${event.reason}`));
    }
  });

  return {
    close: () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
    done,
  };
}
