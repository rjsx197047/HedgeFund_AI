import * as React from 'react';
import { cn } from '@/lib/utils';

// Minimal headless tabs — no Radix dependency. Single source of truth via
// the `value`/`onValueChange` props; renders the matching TabsPanel by
// matching its `value` against the parent.

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('Tabs.* must be rendered inside <Tabs>');
  return ctx;
}

interface TabsProps {
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  const ctx = React.useMemo(
    () => ({ value, setValue: onValueChange }),
    [value, onValueChange],
  );
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn('flex flex-col gap-3', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabsTrigger({
  value,
  className,
  children,
  ...rest
}: TabsTriggerProps) {
  const ctx = useTabsContext();
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      onClick={() => ctx.setValue(value)}
      className={cn(
        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-zinc-800 text-zinc-100 shadow-sm'
          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const ctx = useTabsContext();
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" className={cn('animate-fade-in-up', className)}>
      {children}
    </div>
  );
}
