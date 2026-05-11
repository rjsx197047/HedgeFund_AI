import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        neutral: 'bg-zinc-800/80 text-zinc-200 border border-zinc-700/60',
        success: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
        warning: 'bg-amber-500/10 text-amber-200 border border-amber-500/30',
        danger: 'bg-red-500/10 text-red-300 border border-red-500/30',
        info: 'bg-sky-500/10 text-sky-300 border border-sky-500/30',
        brand: 'bg-brand-orange/15 text-brand-orange border border-brand-orange/30',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
