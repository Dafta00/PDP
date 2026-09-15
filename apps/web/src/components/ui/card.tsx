import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// Swiss-style surfaces: a single hairline border carries the structure,
// not a shadow — enterprise dashboards should read as calm and flat, with
// shadow reserved for genuinely elevated layers (menus, modals).
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-md border border-slate-200 bg-white', className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-slate-200 px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-heading text-sm font-semibold text-slate-800', className)} {...props} />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
