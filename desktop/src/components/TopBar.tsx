import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Home as HomeIcon,
  Loader2,
  Power,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSessionStore } from '@/store/useSessionStore';
import { useStore } from '@/store/useStore';
import { RunStatuses } from '@/types';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// TopBar — drag region + brand + status pills + app menu.
//
// Lives at the top of the Dashboard. Most of it is the macOS title-bar drag
// region (`app-drag-region`) so the user can drag the window from up here;
// interactive elements opt out with `app-no-drag`.
// ─────────────────────────────────────────────────────────────────────────────

interface TopBarProps {
  onOpenSettings: () => void;
}

export function TopBar({ onOpenSettings }: TopBarProps) {
  const goHome = useSessionStore((s) => s.goHome);
  const liveStatus = useStore((s) => s.status);
  const ticker = useStore((s) => s.ticker);
  const tradeDate = useStore((s) => s.tradeDate);
  const provider = useStore((s) => s.provider);

  return (
    <header
      className={cn(
        'app-drag-region relative flex h-12 items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md px-3',
      )}
    >
      {/* macOS traffic-light spacing — `titleBarStyle: 'hiddenInset'` puts
       * them in the upper-left corner, so we leave a gap. */}
      <div className="w-16 shrink-0" />

      <button
        type="button"
        onClick={goHome}
        className="app-no-drag flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-zinc-800/60 transition-colors"
        title="Back to Home"
      >
        <div className="size-6 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 grid place-items-center shadow shadow-amber-500/20">
          <Sparkles className="size-3 text-zinc-950" />
        </div>
        <span className="text-xs font-semibold text-zinc-200 tracking-wide hidden sm:block">
          Trading Agents Lab
        </span>
      </button>

      <div className="app-no-drag flex items-center gap-2 ml-1">
        {ticker && (
          <Badge variant="brand" className="font-mono">
            {ticker}
          </Badge>
        )}
        {tradeDate && (
          <span className="text-[11px] text-zinc-500 font-mono hidden md:block">
            {tradeDate}
          </span>
        )}
        {provider && (
          <Badge variant="info">{provider}</Badge>
        )}
        {liveStatus === RunStatuses.Running && (
          <Badge variant="warning">
            <Loader2 className="size-3 animate-spin" />
            Running
          </Badge>
        )}
        {liveStatus === RunStatuses.Completed && (
          <Badge variant="success">Completed</Badge>
        )}
        {liveStatus === RunStatuses.Errored && (
          <Badge variant="danger">Errored</Badge>
        )}
        {liveStatus === RunStatuses.Aborted && (
          <Badge variant="neutral">Aborted</Badge>
        )}
      </div>

      <div className="flex-1" />

      <div className="app-no-drag flex items-center gap-1">
        <Button
          type="button"
          variant="icon"
          size="icon"
          onClick={goHome}
          title="Home"
          aria-label="Home"
        >
          <HomeIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="icon"
          size="icon"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <SettingsIcon className="size-4" />
        </Button>
        <AppMenu />
      </div>
    </header>
  );
}

// ── App menu (power button → Restart / Shut down) ───────────────────────────

function AppMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="icon"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="App actions"
        className={cn(open && 'bg-zinc-800/70 text-zinc-100')}
      >
        <ChevronDown className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 rounded-2xl border border-zinc-800/80 bg-zinc-950/95 shadow-xl shadow-black/40 p-1 z-30"
        >
          <MenuItem
            icon={<RefreshCw className="size-3.5" />}
            label="Restart"
            hint="Relaunch with a fresh engine"
            onClick={() => {
              setOpen(false);
              window.tradingAgentsLab?.restart?.();
            }}
          />
          <MenuItem
            icon={<Power className="size-3.5" />}
            label="Shut down"
            hint="Stop engine and quit"
            danger
            onClick={() => {
              setOpen(false);
              window.tradingAgentsLab?.shutdown?.();
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors',
        danger
          ? 'text-red-300 hover:bg-red-500/10'
          : 'text-zinc-200 hover:bg-zinc-800/70',
      )}
    >
      <span className="grid place-items-center size-6 rounded-lg bg-zinc-900/60">
        {icon}
      </span>
      <span className="flex flex-col items-start">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-zinc-500">{hint}</span>
      </span>
    </button>
  );
}
