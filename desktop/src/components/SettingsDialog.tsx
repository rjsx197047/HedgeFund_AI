import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  KeyRound,
  Loader2,
  Server,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  OLLAMA_DEFAULT_BASE_URL,
  PROVIDER_LABEL,
  PROVIDER_SECRET_KEY,
  getOllamaHealth,
  type LLMProvider,
  type OllamaHealth,
} from '@/lib/engine-client';
import { getSecret, setSecret, deleteSecret } from '@/lib/secrets';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// SettingsDialog — Day 1 minimum: configure LLM provider API keys.
//
// Full settings page (Data Providers, Cost Guard, OAuth, About) lands on
// later days. The Day 1 surface gets the user to a working debate with
// Ollama or any cloud provider key — that's the minimum useful state.
//
// Storage: keys persist via the existing `lib/secrets.ts` IPC bridge to
// Electron's `safeStorage`. Ollama base URL stores under the same key
// prefix so users with a non-localhost daemon can persist that too.
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDERS: LLMProvider[] = [
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'ollama',
];

const OLLAMA_BASE_URL_KEY = 'llm:ollama:base-url';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Bring your own LLM keys or run locally via Ollama. Keys are encrypted by your OS keychain and never leave this machine."
      className="max-w-2xl"
    >
      <div className="space-y-3">
        {PROVIDERS.map((provider) => (
          <ProviderRow key={provider} provider={provider} />
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 text-[11px] text-zinc-500 leading-relaxed">
        <span className="text-zinc-400 font-medium">Day 1 build</span> — Data
        providers, Cost Guard, and ChatGPT OAuth ship later in the rewrite.
        For now this dialog covers the LLM keys you need to run a debate.
      </div>
    </Dialog>
  );
}

// ── Provider row ────────────────────────────────────────────────────────────

function ProviderRow({ provider }: { provider: LLMProvider }) {
  const isOllama = provider === 'ollama';
  const secretKey = PROVIDER_SECRET_KEY[provider];

  const [storedKey, setStoredKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState<'saved' | 'error' | null>(null);
  const [ollamaHealth, setOllamaHealth] = useState<OllamaHealth | null>(null);
  const [probing, setProbing] = useState(false);

  // Hydrate stored key + base URL when the dialog mounts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await getSecret(secretKey);
        if (!cancelled) setStoredKey(existing ?? '');
        if (isOllama) {
          const url = await getSecret(OLLAMA_BASE_URL_KEY);
          if (!cancelled) setBaseUrl(url ?? OLLAMA_DEFAULT_BASE_URL);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [secretKey, isOllama]);

  // Auto-probe Ollama health when its row hydrates so the user sees the
  // green pill (or red) without having to click Test.
  useEffect(() => {
    if (!isOllama || loading) return;
    let cancelled = false;
    (async () => {
      setProbing(true);
      const result = await getOllamaHealth(baseUrl || undefined);
      if (!cancelled) {
        setOllamaHealth(result);
        setProbing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOllama, loading, baseUrl]);

  const onSave = async () => {
    setSaving(true);
    setSavedFlash(null);
    try {
      if (keyInput.trim()) {
        await setSecret(secretKey, keyInput.trim());
        setStoredKey(keyInput.trim());
        setKeyInput('');
      }
      if (isOllama) {
        const trimmed = baseUrl.trim() || OLLAMA_DEFAULT_BASE_URL;
        await setSecret(OLLAMA_BASE_URL_KEY, trimmed);
        // Re-probe with the new URL.
        const result = await getOllamaHealth(trimmed);
        setOllamaHealth(result);
      }
      setSavedFlash('saved');
      setTimeout(() => setSavedFlash(null), 1500);
    } catch {
      setSavedFlash('error');
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    setSaving(true);
    try {
      await deleteSecret(secretKey);
      setStoredKey('');
      setKeyInput('');
    } finally {
      setSaving(false);
    }
  };

  const status = useMemo(() => {
    if (loading) return null;
    if (isOllama) {
      if (probing) return { kind: 'probing' as const };
      if (ollamaHealth?.ok)
        return { kind: 'connected' as const, models: ollamaHealth.models };
      if (ollamaHealth && !ollamaHealth.ok)
        return { kind: 'unreachable' as const, error: ollamaHealth.error };
      return null;
    }
    return storedKey
      ? { kind: 'connected' as const }
      : { kind: 'disconnected' as const };
  }, [loading, isOllama, probing, ollamaHealth, storedKey]);

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700/80">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          {isOllama ? (
            <Cpu className="size-4 text-fuchsia-300" />
          ) : (
            <KeyRound className="size-4 text-amber-300" />
          )}
          <div className="text-sm font-semibold text-zinc-100">
            {PROVIDER_LABEL[provider]}
          </div>
          <StatusPill status={status} />
        </div>
      </div>

      <div className="space-y-2">
        {isOllama && (
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500 flex items-center gap-1">
              <Server className="size-3" />
              Base URL
            </span>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={OLLAMA_DEFAULT_BASE_URL}
              className="mt-1 font-mono text-xs"
              spellCheck={false}
            />
          </label>
        )}

        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            {isOllama ? 'API key (optional, for remote auth)' : 'API key'}
          </span>
          <div className="mt-1 flex gap-2">
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={
                storedKey
                  ? `••••••••${storedKey.slice(-4)}`
                  : isOllama
                    ? '(empty for localhost)'
                    : providerKeyPlaceholder(provider)
              }
              className="font-mono text-xs"
              spellCheck={false}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="default"
              size="default"
              onClick={onSave}
              disabled={
                saving || (!keyInput.trim() && !isOllama)
              }
              className="shrink-0"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                'Save'
              )}
            </Button>
            {storedKey && !isOllama && (
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={onClear}
                disabled={saving}
                className="shrink-0"
              >
                Clear
              </Button>
            )}
          </div>
          {savedFlash === 'saved' && (
            <p className="mt-1 text-[11px] text-emerald-400">Saved.</p>
          )}
          {savedFlash === 'error' && (
            <p className="mt-1 text-[11px] text-red-400">
              Failed to save — see DevTools console.
            </p>
          )}
        </label>

        {isOllama && status?.kind === 'connected' && status.models && (
          <div className="pt-1">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">
              Installed models
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {status.models.length === 0 ? (
                <span className="text-[11px] text-zinc-500">
                  No models installed — run{' '}
                  <code className="px-1 py-0.5 bg-zinc-800/80 rounded text-zinc-300">
                    ollama pull llama3.1:8b
                  </code>{' '}
                  in your terminal.
                </span>
              ) : (
                status.models.map((m) => (
                  <Badge key={m} variant="info" className="font-mono">
                    {m}
                  </Badge>
                ))
              )}
            </div>
          </div>
        )}

        {isOllama && status?.kind === 'unreachable' && (
          <p className="text-[11px] text-amber-400 leading-relaxed">
            Can't reach Ollama at this URL{status.error ? ` (${status.error})` : ''}.
            Run{' '}
            <code className="px-1 py-0.5 bg-zinc-800/80 rounded text-zinc-300">
              ollama serve
            </code>{' '}
            and click Save to retry.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Status pill ─────────────────────────────────────────────────────────────

type Status =
  | { kind: 'connected'; models?: string[] }
  | { kind: 'disconnected' }
  | { kind: 'probing' }
  | { kind: 'unreachable'; error?: string }
  | null;

function StatusPill({ status }: { status: Status }) {
  if (!status) return null;
  if (status.kind === 'connected') {
    return (
      <Badge variant="success">
        <CheckCircle2 className="size-3" />
        Connected
      </Badge>
    );
  }
  if (status.kind === 'probing') {
    return (
      <Badge variant="neutral">
        <Loader2 className="size-3 animate-spin" />
        Probing
      </Badge>
    );
  }
  if (status.kind === 'unreachable') {
    return (
      <Badge variant="warning">
        <XCircle className="size-3" />
        Unreachable
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" className={cn('text-zinc-500')}>
      Not configured
    </Badge>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function providerKeyPlaceholder(provider: LLMProvider): string {
  switch (provider) {
    case 'openai':
      return 'sk-…';
    case 'anthropic':
      return 'sk-ant-…';
    case 'gemini':
      return 'AIza…';
    case 'openrouter':
      return 'sk-or-…';
    default:
      return '';
  }
}
