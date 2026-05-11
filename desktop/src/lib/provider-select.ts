import {
  OLLAMA_DEFAULT_BASE_URL,
  PROVIDER_DEFAULT_MODEL,
  PROVIDER_PRIORITY,
  PROVIDER_SECRET_KEY,
  getOllamaHealth,
  getModelStorageKey,
  type LLMProvider,
  type ProviderConfig,
} from '@/lib/engine-client';
import { getSecret } from '@/lib/secrets';

// ─────────────────────────────────────────────────────────────────────────────
// provider-select — pick which LLM provider to run this debate with.
//
// Rules:
//   1. Walk PROVIDER_PRIORITY in order; the first provider that's
//      "available" wins. "Available" = an API key is set for cloud
//      providers, OR (for ollama) the daemon is reachable.
//   2. The chosen provider's model comes from localStorage (the user's
//      last manual pick) or falls back to PROVIDER_DEFAULT_MODEL.
//   3. For ollama we also read the saved base URL (or default localhost).
//   4. Return null when no provider is available → caller should prompt
//      the user to open Settings.
//
// OAuth (ChatGPT subscription) is intentionally not handled in Day 2 — the
// OAuth panel comes Day 3 along with the rest of Settings, and routing
// OAuth through here requires extra IPC. For now this returns the
// `api_key` shape only.
// ─────────────────────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL_KEY = 'llm:ollama:base-url';

export interface SelectionResult {
  provider: LLMProvider;
  model: string;
  /** Built ProviderConfig ready to ship on the WS start frame. */
  config: ProviderConfig;
}

export async function pickProvider(): Promise<SelectionResult | null> {
  for (const provider of PROVIDER_PRIORITY) {
    const result = await tryProvider(provider);
    if (result) return result;
  }
  return null;
}

async function tryProvider(
  provider: LLMProvider,
): Promise<SelectionResult | null> {
  if (provider === 'ollama') {
    const baseUrl =
      (await getSecret(OLLAMA_BASE_URL_KEY)) || OLLAMA_DEFAULT_BASE_URL;
    const health = await getOllamaHealth(baseUrl);
    if (!health.ok) return null;
    const model = pickModelFor(provider, health.models);
    return {
      provider,
      model,
      config: {
        provider,
        auth: { type: 'api_key', api_key: '' },
        model,
        base_url: baseUrl,
      },
    };
  }

  const key = await getSecret(PROVIDER_SECRET_KEY[provider]);
  if (!key) return null;
  const model = pickModelFor(provider);
  return {
    provider,
    model,
    config: {
      provider,
      auth: { type: 'api_key', api_key: key },
      model,
    },
  };
}

function pickModelFor(provider: LLMProvider, installed?: string[]): string {
  // User's last manual pick wins. Stored under `tal:analyze:selected-model:<provider>`
  // by the (Day-3-ish) settings model picker. Until that exists this just
  // returns the default.
  const stored =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(getModelStorageKey(provider, 'api_key'))
      : null;
  if (stored) {
    // For ollama, double-check the model is actually installed before using
    // it — the user may have deleted it via `ollama rm`.
    if (provider === 'ollama' && installed && !installed.includes(stored)) {
      // Fall through to the auto-pick below.
    } else {
      return stored;
    }
  }
  if (provider === 'ollama' && installed && installed.length > 0) {
    // Prefer the configured default if installed, otherwise the first one.
    const preferred = PROVIDER_DEFAULT_MODEL[provider];
    if (installed.includes(preferred)) return preferred;
    return installed[0];
  }
  return PROVIDER_DEFAULT_MODEL[provider];
}
