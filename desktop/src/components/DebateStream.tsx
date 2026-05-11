import { useMemo } from 'react';
import {
  BarChart3,
  Briefcase,
  FlameIcon,
  HeartHandshake,
  Loader2,
  MessageSquare,
  Newspaper,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store/useStore';
import { RunStatuses, type DebateEvent } from '@/types';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// DebateStream — renders the 12-agent debate as a chronological list grouped
// by phase. Reads from `useStore.events` (filtered to agent.message + the
// surrounding phase.transition markers).
//
// Visual model:
//   Phase header (e.g. "Phase 1 — Analysts") + the agents in that phase
//   appear as cards with icon + role label + message body. The currently-
//   streaming agent (if status == Running and we have events) gets a soft
//   amber border + a Loader2 pill.
// ─────────────────────────────────────────────────────────────────────────────

interface AgentMeta {
  label: string;
  icon: LucideIcon;
  color: string; // tailwind text-color for icon
}

const AGENT_META: Record<string, AgentMeta> = {
  technical_analyst:    { label: 'Technical Analyst',    icon: BarChart3,      color: 'text-sky-300' },
  fundamental_analyst:  { label: 'Fundamental Analyst',  icon: Briefcase,      color: 'text-emerald-300' },
  news_analyst:         { label: 'News Analyst',         icon: Newspaper,      color: 'text-amber-300' },
  sentiment_analyst:    { label: 'Sentiment Analyst',    icon: MessageSquare,  color: 'text-fuchsia-300' },
  bull_researcher:      { label: 'Bull Researcher',      icon: TrendingUp,     color: 'text-emerald-300' },
  bear_researcher:      { label: 'Bear Researcher',      icon: TrendingDown,   color: 'text-red-300' },
  research_manager:     { label: 'Research Manager',     icon: Scale,          color: 'text-amber-300' },
  trader:               { label: 'Trader',               icon: HeartHandshake, color: 'text-violet-300' },
  risk_aggressive:      { label: 'Risk · Aggressive',    icon: FlameIcon,      color: 'text-red-300' },
  risk_conservative:    { label: 'Risk · Conservative',  icon: Snowflake,      color: 'text-sky-300' },
  risk_neutral:         { label: 'Risk · Neutral',       icon: ShieldCheck,    color: 'text-zinc-300' },
  portfolio_manager:    { label: 'Portfolio Manager',    icon: ShieldAlert,    color: 'text-amber-300' },
};

const PHASE_ORDER = ['analysts', 'researchers', 'trader', 'risk'] as const;
type Phase = (typeof PHASE_ORDER)[number];

const PHASE_LABEL: Record<Phase, string> = {
  analysts: 'Phase 1 · Analysts',
  researchers: 'Phase 2 · Researchers',
  trader: 'Phase 3 · Trader',
  risk: 'Phase 4 · Risk Committee',
};

const PHASE_DESCRIPTION: Record<Phase, string> = {
  analysts: 'Technical, fundamental, news, and sentiment perspectives.',
  researchers: 'Bull vs bear debate with a research-manager arbitration.',
  trader: 'Concrete plan — entry, sizing, stop.',
  risk: 'Aggressive / conservative / neutral views feed the portfolio manager.',
};

interface AgentMessage {
  agent: string;
  phase: string;
  content: string;
}

export function DebateStream() {
  const events = useStore((s) => s.events);
  const status = useStore((s) => s.status);

  const grouped = useMemo(() => groupByPhase(events), [events]);
  const totalMessages = useMemo(
    () => events.filter((e) => e.type === 'agent.message').length,
    [events],
  );

  if (totalMessages === 0 && status !== RunStatuses.Running) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-amber-300" />
            <CardTitle>Debate transcript</CardTitle>
          </div>
          <Badge variant="neutral">{totalMessages}/12 agents</Badge>
        </div>
        <CardDescription>
          Each agent runs sequentially — later agents see everything earlier
          agents said.
        </CardDescription>
      </CardHeader>

      <div className="p-4 pt-0 space-y-5">
        {PHASE_ORDER.map((phase) => {
          const msgs = grouped[phase];
          const isCurrentPhase =
            status === RunStatuses.Running &&
            phase === currentPhase(events);
          const phaseStarted = msgs.length > 0 || isCurrentPhase;
          if (!phaseStarted) {
            return <PhaseSkeleton key={phase} phase={phase} />;
          }
          return (
            <PhaseBlock
              key={phase}
              phase={phase}
              messages={msgs}
              waitingForNext={isCurrentPhase && msgs.length < expectedAgents(phase)}
            />
          );
        })}
      </div>
    </Card>
  );
}

// ── Phase block ─────────────────────────────────────────────────────────────

function PhaseBlock({
  phase,
  messages,
  waitingForNext,
}: {
  phase: Phase;
  messages: AgentMessage[];
  waitingForNext: boolean;
}) {
  return (
    <section>
      <header className="flex items-center gap-2 mb-2">
        <h3 className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
          {PHASE_LABEL[phase]}
        </h3>
        <span className="text-[11px] text-zinc-600">
          · {PHASE_DESCRIPTION[phase]}
        </span>
      </header>
      <div className="space-y-2">
        {messages.map((m, i) => (
          <AgentCard key={`${phase}-${i}-${m.agent}`} message={m} />
        ))}
        {waitingForNext && <StreamingPlaceholder />}
      </div>
    </section>
  );
}

function PhaseSkeleton({ phase }: { phase: Phase }) {
  return (
    <section className="opacity-40">
      <header className="flex items-center gap-2 mb-2">
        <h3 className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
          {PHASE_LABEL[phase]}
        </h3>
        <span className="text-[11px] text-zinc-600">
          · {PHASE_DESCRIPTION[phase]}
        </span>
      </header>
      <div className="rounded-xl border border-dashed border-zinc-800 px-3 py-3 text-[11px] text-zinc-600">
        Pending — earlier phase needs to finish first.
      </div>
    </section>
  );
}

function AgentCard({ message }: { message: AgentMessage }) {
  const meta = AGENT_META[message.agent] ?? {
    label: message.agent,
    icon: MessageSquare,
    color: 'text-zinc-300',
  };
  const Icon = meta.icon;
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={cn(
            'grid place-items-center size-6 rounded-lg bg-zinc-900/80',
            meta.color,
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="text-xs font-semibold text-zinc-200">
          {meta.label}
        </span>
      </div>
      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {message.content}
      </p>
    </article>
  );
}

function StreamingPlaceholder() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-200">
      <Loader2 className="size-3 animate-spin" />
      <span>Streaming next agent…</span>
    </div>
  );
}

// ── Grouping helpers ────────────────────────────────────────────────────────

function groupByPhase(events: DebateEvent[]): Record<Phase, AgentMessage[]> {
  const acc: Record<Phase, AgentMessage[]> = {
    analysts: [],
    researchers: [],
    trader: [],
    risk: [],
  };
  for (const e of events) {
    if (e.type !== 'agent.message') continue;
    const phase = normalizePhase(e.phase);
    if (phase) acc[phase].push({ agent: e.agent, phase: e.phase, content: e.content });
  }
  return acc;
}

function normalizePhase(raw: string): Phase | null {
  const lower = raw.toLowerCase();
  if (lower.includes('analyst')) return 'analysts';
  if (lower.includes('research')) return 'researchers';
  if (lower.includes('trader')) return 'trader';
  if (lower.includes('risk') || lower.includes('portfolio')) return 'risk';
  // Engine sometimes emits the bare phase name (analysts/researchers/trader/risk).
  if ((PHASE_ORDER as readonly string[]).includes(lower)) return lower as Phase;
  return null;
}

function currentPhase(events: DebateEvent[]): Phase {
  // Last agent.message's phase is the current speaker's phase; if none yet,
  // we're starting analysts.
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'agent.message') {
      const phase = normalizePhase(e.phase);
      if (phase) return phase;
    }
  }
  return 'analysts';
}

function expectedAgents(phase: Phase): number {
  switch (phase) {
    case 'analysts':
      return 4;
    case 'researchers':
      return 3;
    case 'trader':
      return 1;
    case 'risk':
      return 4;
  }
}
