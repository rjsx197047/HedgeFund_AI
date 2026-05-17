/**
 * Shared request-assembly + stream helper for analysis runs.
 *
 * Both single-ticker (Analyze page) and multi-ticker (Watchlist batch
 * runner) flows need the same provider resolution, Alpaca data config,
 * CostGuard reservation, and webhook attachment. Analyze.tsx still
 * inlines its own copy (refactor deferred to v1.1); BatchRunner uses
 * this. Keeping both means a single-purpose extraction that doesn't
 * destabilise the proven single-ticker path.
 *
 * The caller passes a cost-guard handler so this module never owns UI:
 * Analyze opens a modal, Batch can auto-cancel or prompt globally.
 */

import {
  PROVIDER_SECRET_KEY,
  streamDebate,
  type DebateEvent,
  type LLMProvider,
  type ProviderConfig,
  type StreamHandle,
} from './engine-client';
import {
  CostGuardBlocked,
  reserveCostGuard,
} from './cost-guard';
import { getSecret } from './secrets';
import { loadLocalConfig } from './local-llm';
import { getOpenAICredentialsForRequest } from './oauth';
import { loadWebhooks, type WebhookConfig } from './webhooks';

export interface RunAnalysisOptions {
  ticker: string;
  trade_date: string;
  /** Active LLM provider chosen by the caller (the priority resolver
   * + manual override happens upstream in the UI). Null → stub mode. */
  provider: LLMProvider | null;
  /** OpenAI-only: whether to prefer OAuth (subscription) over API key.
   * Ignored for other providers. */
  openaiAuthKind: 'oauth' | 'api_key';
  /** Pre-resolved model id (the UI knows the recommended-for-provider
   * default + user override). Empty string is acceptable for `local`,
   * where the model comes from the saved local-llm config. */
  model: string;
  /** Default 400 — same as Analyze.tsx. */
  maxTokens?: number;
}

export interface RunAnalysisCallbacks {
  /** Fires for every WS event from the engine. */
  onEvent: (event: DebateEvent) => void;
  /** Fires on stream-level errors. */
  onError?: (err: unknown) => void;
  /** Called when CostGuard blocks the reservation. Return `true` to
   * proceed with override, `false` to abort. If omitted, blocked
   * reservations propagate as a thrown CostGuardBlocked. */
  onCostBlocked?: (block: CostGuardBlocked) => Promise<boolean>;
}

export type RunAnalysisResult =
  | { kind: 'streaming'; handle: StreamHandle }
  | { kind: 'cancelled'; reason: 'cost_guard' }
  | { kind: 'no_provider' };

/**
 * Build the request, optionally negotiate CostGuard, and open the WS.
 * Caller awaits `result.handle.done` for the streaming case.
 *
 * Throws on unexpected errors (handshake failure, unrecognised CostGuard
 * error). Routine "no provider configured" returns `no_provider` so the
 * caller can decide whether to fall through to stub or skip.
 */
export async function runAnalysis(
  opts: RunAnalysisOptions,
  callbacks: RunAnalysisCallbacks,
): Promise<RunAnalysisResult> {
  const maxTokens = opts.maxTokens ?? 400;
  const providerConfig = await resolveProviderConfig(opts, maxTokens);
  const dataConfig = await resolveDataConfig();

  let reservationId: string | undefined;
  if (providerConfig) {
    const cgModel = providerConfig.model ?? '';
    const reserveReq = {
      model: cgModel,
      auth_kind: providerConfig.auth.type,
      max_tokens: maxTokens,
    };
    try {
      const reservation = await reserveCostGuard(reserveReq);
      reservationId = reservation.reservation_id;
    } catch (err) {
      if (err instanceof CostGuardBlocked) {
        if (!callbacks.onCostBlocked) throw err;
        const proceed = await callbacks.onCostBlocked(err);
        if (!proceed) return { kind: 'cancelled', reason: 'cost_guard' };
        const reservation = await reserveCostGuard({
          ...reserveReq,
          override: true,
        });
        reservationId = reservation.reservation_id;
      } else {
        throw err;
      }
    }
  }

  const { webhookConfigs, telegramChatIds } = await loadWebhooksForStream();

  const handle = await streamDebate(
    {
      ticker: opts.ticker,
      trade_date: opts.trade_date,
      provider_config: providerConfig,
      reservation_id: reservationId,
      data_config: dataConfig,
      webhooks: webhookConfigs.length > 0 ? webhookConfigs : undefined,
      telegram_chat_ids:
        Object.keys(telegramChatIds).length > 0 ? telegramChatIds : undefined,
    },
    callbacks.onEvent,
    callbacks.onError,
  );
  return { kind: 'streaming', handle };
}

async function resolveProviderConfig(
  opts: RunAnalysisOptions,
  maxTokens: number,
): Promise<ProviderConfig | undefined> {
  const { provider, openaiAuthKind, model } = opts;
  if (!provider) return undefined;

  try {
    if (provider === 'openai') {
      if (openaiAuthKind === 'oauth') {
        const creds = await getOpenAICredentialsForRequest();
        if (creds) {
          return {
            provider: 'openai',
            auth: {
              type: 'oauth',
              access: creds.access,
              refresh: creds.refresh,
              expires: creds.expires,
              account_id: creds.accountId,
            },
            model,
            max_tokens: maxTokens,
          };
        }
      }
      const apiKey = await getSecret(PROVIDER_SECRET_KEY.openai);
      if (apiKey) {
        return {
          provider: 'openai',
          auth: { type: 'api_key', api_key: apiKey },
          model,
          max_tokens: maxTokens,
        };
      }
      return undefined;
    }

    if (provider === 'local') {
      const localCfg = await loadLocalConfig();
      if (!localCfg) return undefined;
      return {
        provider: 'local',
        auth: { type: 'local', base_url: localCfg.base_url },
        model: localCfg.model,
        max_tokens: maxTokens,
      };
    }

    const apiKey = await getSecret(PROVIDER_SECRET_KEY[provider]);
    if (!apiKey) return undefined;
    return {
      provider,
      auth: { type: 'api_key', api_key: apiKey },
      model,
      max_tokens: maxTokens,
    };
  } catch {
    return undefined;
  }
}

async function resolveDataConfig(): Promise<
  { provider: 'alpaca'; key_id: string; secret: string } | undefined
> {
  try {
    const [keyId, secret] = await Promise.all([
      getSecret('data:alpaca-key-id'),
      getSecret('data:alpaca-secret'),
    ]);
    if (keyId && secret) {
      return { provider: 'alpaca', key_id: keyId, secret };
    }
  } catch {
    // safeStorage offline. Fall through to engine's yfinance default.
  }
  return undefined;
}

async function loadWebhooksForStream(): Promise<{
  webhookConfigs: WebhookConfig[];
  telegramChatIds: Record<string, string>;
}> {
  try {
    const configs = await loadWebhooks();
    const chatIds: Record<string, string> = {};
    for (const w of configs) {
      if (w.kind === 'telegram' && w.telegram_chat_id) {
        chatIds[w.id] = w.telegram_chat_id;
      }
    }
    return { webhookConfigs: configs, telegramChatIds: chatIds };
  } catch {
    return { webhookConfigs: [], telegramChatIds: {} };
  }
}
