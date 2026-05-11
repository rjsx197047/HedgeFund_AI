import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-9 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-sm text-zinc-100',
          'placeholder:text-zinc-500 outline-none transition-colors',
          'focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
