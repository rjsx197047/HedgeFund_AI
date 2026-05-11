import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Cpu,
  KeyRound,
  Loader2,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { CostGuardPanel } from '@/components/CostGuardPanel';
import {
  OLLAMA_DEFAULT_BASE_URL,
  PROVIDER_LABEL,
  PROVIDER_MODELS,
  PROVIDER_SECRET_KEY,
  getModelStorageKey,
  getOllamaHealth,
  getRecommendedModel,
  type LLMProvider,
  type ModelChoice,
  type OllamaHealth,
} from '@/lib/engine-client';
import { getSecret, setSecret, deleteSecret } from '@/lib/secrets';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// SettingsDialog — Day 3.
//
// Two-tab dialog: LLM Providers (keys + model picker per provider, Ollama
// gets a base URL + auto-probe) and Cost Guard (spend caps + sessions/day
// rate cap with progress bars).
//
// Data Providers (Alpaca) and ChatGPT OAuth ship later — the OAuth flow has
// a bunch of IPC plumbing tied to electron/main.ts that I want to validate
// before exposing.
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDERS: LLMProvider[] = [
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'ollama',
];

const OLLAMA_BASE_URL_KEY = 'llm:ollama:base-url';

type SettingsTab = 'providers' | 'cost-guard';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

export function SettingsDialog({
  open,
  onClose,
  initialTab = 'providers',
}: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Bring your own keys or run locally with Ollama. Keys are encrypted by your OS keychain and never leave this machine."
      className="max-w-2xl"
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
        <TabsList>
          <TabsTrigger value="providers">
            <KeyRound className="size-3 mr-1.5 inline" />
            LLM Providers
          </TabsTrigger>
          <TabsTrigger value="cost-guard">
            <ShieldCheck className="size-3 mr-1.5 inline" />
            Cost Guard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <div className="space-y-3">
            {PROVIDERS.map((provider) => (
              <ProviderRow key={provider} provider={provider} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="cost-guard">
          <CostGuardPanel />
        </TabsContent>
      </Tabs>

      <div className="mt-6 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 text-[11px] text-zinc-500 leading-relaxed">
        <span className="text-zinc-400 font-medium">Coming next.</span>{' '}
        Data Providers (Alpaca SIP feed) and ChatGPT OAuth ship later in the
        rewrite. For now, this dialog covers what you need for a working
        debate.
      </div>
    </Dialog>
  );
}

// ── Provider row ────────────────────────────────────────────────────────────

function ProviderRow({ provider }: { provider: LLMProvider }) {
  const isOllama = provider === 'ollama';
  const secretKey = PROVIDER_SECRET_KEY[provider];
  const modelStorageKey = getModelStorageKey(provider, 'api_key');

  const [storedKey, setStoredKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState<'saved' | 'error' | null>(null);
  const [ollamaHealth, setOllamaHealth] = useState<OllamaHealth | null>(null);
  const [probing, setProbing] = useState(false);

  // Hydrate stored key + base URL + selected model on mount.
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
        const stored =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem(modelStorageKey)
            : null;
        if (!cancelled) {
          setSelectedModel(
            stored ?? getRecommendedModel(provider, 'api_key'),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [secretKey, isOllama, provider, modelStorageKey]);

  // Auto-probe Ollama health on mount + whenever the base URL changes.
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
        const result = await getOllamaHealth(trimmed);
        setOllamaHealth(result);
      }
      if (selectedModel) {
        localStorage.setItem(modelStorageKey, selectedModel);
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

  // Build the model list for the picker. For Ollama, prefer the live list
  // from /providers/ollama/health when available; otherwise fall back to the
  // baseline suggestions in PROVIDER_MODELS.
  const modelOptions: ModelChoice[] = useMemo(() => {
    if (isOllama && ollamaHealth?.ok && ollamaHealth.models?.length) {
      return ollamaHealth.models.map((id) => ({ id, label: id }));
    }
    return PROVIDER_MODELS[provider];
  }, [isOllama, ollamaHealth, provider]);

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
                saving ||
                (!keyInput.trim() && !isOllama && selectedModel === '')
              }
              className="shrink-0"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
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

        {/* Model picker — surfaces the available model list for this provider.
            Ollama's list comes live from the daemon; cloud providers use
            PROVIDER_MODELS curated list. Selection persists per-provider in
            localStorage so switching providers and back remembers each one. */}
        <ModelPicker
          options={modelOptions}
          value={selectedModel}
          onChange={(v) => setSelectedModel(v)}
          disabled={modelOptions.length === 0}
          empty={
            isOllama && status?.kind === 'connected' && (status.models?.length ?? 0) === 0
          }
        />

        {isOllama && status?.kind === 'unreachable' && (
          <p className="text-[11px] text-amber-400 leading-relaxed">
            Can't reach Ollama at this URL
            {status.error ? ` (${status.error})` : ''}. Run{' '}
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

// ── Model picker (small native select) ──────────────────────────────────────

function ModelPicker({
  options,
  value,
  onChange,
  disabled,
  empty,
}: {
  options: ModelChoice[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        No models installed yet — run{' '}
        <code className="px-1 py-0.5 bg-zinc-800/80 rounded text-zinc-300">
          ollama pull llama3.1:8b
        </code>{' '}
        in a terminal, then click Save above.
      </p>
    );
  }
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-zinc-500">
        Model
      </span>
      <div className="relative mt-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            'w-full appearance-none rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 pr-8 text-xs text-zinc-100 font-mono',
            'outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {options.map((m) => (
            <option key={m.id} value={m.id} className="bg-zinc-900">
              {m.label}
              {m.note ? ` — ${m.note}` : ''}
              {m.recommended ? ' ★' : ''}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
      </div>
    </label>
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
    <Badge variant="neutral" className="text-zinc-500">
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
