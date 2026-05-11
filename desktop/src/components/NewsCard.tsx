import { ExternalLink, Newspaper } from 'lucide-react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store/useStore';
import { relativeTime } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// NewsCard — renders the headlines the engine pulls early in the debate
// (the `news.headlines` event). Reads from useStore.headlines. Renders
// nothing when none have arrived yet.
//
// Clicking a headline opens the URL externally via Electron's
// shell.openExternal (set up at the main-process level via
// `setWindowOpenHandler` in main.ts). In the browser this falls back to a
// regular target="_blank".
// ─────────────────────────────────────────────────────────────────────────────

export function NewsCard() {
  const headlines = useStore((s) => s.headlines);
  if (!headlines || headlines.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Newspaper className="size-4 text-amber-300" />
            <CardTitle>News headlines</CardTitle>
          </div>
          <Badge variant="neutral">{headlines.length}</Badge>
        </div>
        <CardDescription>
          Recent headlines available to the news analyst for context.
        </CardDescription>
      </CardHeader>

      <ul className="p-4 pt-0 space-y-2">
        {headlines.map((h, i) => (
          <li key={`${h.url || h.title}-${i}`}>
            <a
              href={h.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-xl border border-zinc-800/80 bg-zinc-950/30 px-3 py-2 transition-colors hover:border-zinc-700/80"
            >
              <div className="flex items-start gap-2">
                <span className="flex-1 text-xs font-medium text-zinc-100 group-hover:text-amber-200 transition-colors">
                  {h.title || '(untitled)'}
                </span>
                {h.url && (
                  <ExternalLink className="size-3 mt-0.5 text-zinc-600 group-hover:text-amber-300" />
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                {h.publisher && <span>{h.publisher}</span>}
                {h.publisher && h.pub_date && (
                  <span className="text-zinc-700">·</span>
                )}
                {h.pub_date && <span>{relativeTime(h.pub_date)}</span>}
              </div>
              {h.summary && (
                <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                  {h.summary}
                </p>
              )}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
