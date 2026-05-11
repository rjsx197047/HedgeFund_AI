import { useEffect, useState } from 'react';
import { Loader2, Save, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  getCostGuardState,
  updateCostGuardConfig,
  type CostGuardConfig,
  type SpendState,
} from '@/lib/cost-guard';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// CostGuardPanel — Day 3 settings tab.
//
// Renders three USD windows (daily / weekly / monthly) plus a sessions-per-day
// rate cap. Each input is bound to the engine state; Save writes back via
// PUT /cost-guard/config. Spend progress bars sit above each cap.
//
// Caps of 0 disable that dimension entirely. Engine enforces; renderer just
// shows the current state.
// ─────────────────────────────────────────────────────────────────────────────

export function CostGuardPanel() {
  const [state, setState] = useState<
    { spend: SpendState; config: CostGuardConfig } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Editable form state — separate from `state` so the user can tweak
  // multiple fields before clicking Save without each keystroke firing
  // the PUT.
  const [draft, setDraft] = useState<CostGuardConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getCostGuardState();
        if (!cancelled) {
          setState(data);
          setDraft(data.config);
        }
      } catch (err) {
        if (!cancelled)
          setSaveError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateCostGuardConfig({
        enabled: draft.enabled,
        cap_daily_usd: draft.cap_daily_usd,
        cap_weekly_usd: draft.cap_weekly_usd,
        cap_monthly_usd: draft.cap_monthly_usd,
        cap_sessions_per_day: draft.cap_sessions_per_day,
      });
      setState((s) => (s ? { ...s, config: updated } : s));
      setDraft(updated);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !state || !draft) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 p-6">
        <Loader2 className="size-3.5 animate-spin" />
        Loading Cost Guard state…
      </div>
    );
  }

  const dirty =
    draft.enabled !== state.config.enabled ||
    draft.cap_daily_usd !== state.config.cap_daily_usd ||
    draft.cap_weekly_usd !== state.config.cap_weekly_usd ||
    draft.cap_monthly_usd !== state.config.cap_monthly_usd ||
    draft.cap_sessions_per_day !== state.config.cap_sessions_per_day;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <header className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {draft.enabled ? (
              <ShieldCheck className="size-4 text-emerald-300" />
            ) : (
              <ShieldOff className="size-4 text-zinc-500" />
            )}
            <h3 className="text-sm font-semibold text-zinc-100">
              Cost Guard
            </h3>
            <Badge variant={draft.enabled ? 'success' : 'neutral'}>
              {draft.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, enabled: e.target.checked } : d))
              }
              className="accent-amber-500"
            />
            Enabled
          </label>
        </header>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Atomic USD caps + per-day session count. Reservations are made
          before each debate so parallel runs can't blow the cap. Set a cap
          to <code className="px-1 py-0.5 bg-zinc-800/80 rounded text-zinc-300">0</code>{' '}
          to disable that dimension.
        </p>
      </div>

      <SpendRow
        label="Daily USD cap"
        spend={state.spend.daily_usd}
        cap={draft.cap_daily_usd}
        onCapChange={(n) =>
          setDraft((d) => (d ? { ...d, cap_daily_usd: n } : d))
        }
        disabled={!draft.enabled}
      />
      <SpendRow
        label="Weekly USD cap"
        spend={state.spend.weekly_usd}
        cap={draft.cap_weekly_usd}
        onCapChange={(n) =>
          setDraft((d) => (d ? { ...d, cap_weekly_usd: n } : d))
        }
        disabled={!draft.enabled}
      />
      <SpendRow
        label="Monthly USD cap"
        spend={state.spend.monthly_usd}
        cap={draft.cap_monthly_usd}
        onCapChange={(n) =>
          setDraft((d) => (d ? { ...d, cap_monthly_usd: n } : d))
        }
        disabled={!draft.enabled}
      />
      <SessionsRow
        spend={state.spend.sessions_today}
        cap={draft.cap_sessions_per_day}
        onCapChange={(n) =>
          setDraft((d) => (d ? { ...d, cap_sessions_per_day: n } : d))
        }
        disabled={!draft.enabled}
      />

      <div className="flex items-center justify-end gap-2 pt-2">
        {saveError && (
          <span className="text-[11px] text-red-400 mr-auto">{saveError}</span>
        )}
        {savedAt && (
          <span className="text-[11px] text-emerald-400 mr-auto">
            Saved.
          </span>
        )}
        <Button
          variant="default"
          size="default"
          onClick={onSave}
          disabled={!dirty || saving}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save Cost Guard
        </Button>
      </div>
    </div>
  );
}

// ── Row components ──────────────────────────────────────────────────────────

function SpendRow({
  label,
  spend,
  cap,
  onCapChange,
  disabled,
}: {
  label: string;
  spend: number;
  cap: number;
  onCapChange: (n: number) => void;
  disabled?: boolean;
}) {
  const pct = cap > 0 ? Math.min(100, (spend / cap) * 100) : 0;
  const tone =
    pct >= 90
      ? 'bg-red-500/60'
      : pct >= 70
        ? 'bg-amber-500/60'
        : 'bg-emerald-500/60';

  return (
    <div
      className={cn(
        'rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3',
        disabled && 'opacity-50',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-zinc-200">{label}</span>
        <span className="text-[11px] font-mono text-zinc-500">
          ${spend.toFixed(4)} / ${cap.toFixed(2)}{' '}
          {cap === 0 && <span className="text-zinc-600">(disabled)</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-2">
        <div
          className={cn('h-full transition-[width] duration-300', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-500 shrink-0 w-14">USD cap</span>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          value={cap}
          onChange={(e) => onCapChange(Number(e.target.value) || 0)}
          disabled={disabled}
          className="font-mono text-xs h-8"
        />
      </div>
    </div>
  );
}

function SessionsRow({
  spend,
  cap,
  onCapChange,
  disabled,
}: {
  spend: number;
  cap: number;
  onCapChange: (n: number) => void;
  disabled?: boolean;
}) {
  const pct = cap > 0 ? Math.min(100, (spend / cap) * 100) : 0;
  const tone =
    pct >= 90
      ? 'bg-red-500/60'
      : pct >= 70
        ? 'bg-amber-500/60'
        : 'bg-emerald-500/60';
  return (
    <div
      className={cn(
        'rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3',
        disabled && 'opacity-50',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-zinc-200">
          Sessions/day rate cap
        </span>
        <span className="text-[11px] font-mono text-zinc-500">
          {spend} / {cap}{' '}
          {cap === 0 && <span className="text-zinc-600">(disabled)</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-2">
        <div
          className={cn('h-full transition-[width] duration-300', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-500 shrink-0 w-14">Per day</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={cap}
          onChange={(e) =>
            onCapChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))
          }
          disabled={disabled}
          className="font-mono text-xs h-8"
        />
      </div>
      <p className="mt-2 text-[10px] text-zinc-500 leading-relaxed">
        Protects ChatGPT subscription quotas on the OAuth path (where
        per-token cost is $0 but rate limits still apply).
      </p>
    </div>
  );
}
