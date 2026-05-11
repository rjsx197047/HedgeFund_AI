import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Minimal headless dialog — no Radix dependency. ESC closes; backdrop click closes;
// click inside content is swallowed. Sufficient for the settings + confirmation
// dialogs we need; if we ever need real focus-trapping etc. we can swap in Radix.

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** When false, the close button (×) is hidden. Default true. */
  showClose?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  showClose = true,
}: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-up" />
      <div
        className={cn(
          'relative z-10 w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950/95 p-6 shadow-2xl shadow-black/40 animate-fade-in-up',
          className,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200 transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
        {title && (
          <h2 className="text-base font-semibold text-zinc-100 mb-1 pr-8">
            {title}
          </h2>
        )}
        {description && (
          <p className="text-xs text-zinc-500 leading-relaxed mb-4">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
