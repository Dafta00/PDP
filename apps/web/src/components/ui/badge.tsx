import { cn } from '@/lib/utils';

// Unified status system: green = success/active, amber = pending/warning,
// red = suspended/error, neutral = inactive/closed, blue (info) = scheduled/
// in-progress states that aren't yet a success or failure outcome.
const STATUS_CLASSES: Record<string, string> = {
  ACTIVE: 'bg-success-50 text-success-700 ring-success-200',
  CONFIRMED: 'bg-success-50 text-success-700 ring-success-200',
  VERIFIED: 'bg-success-50 text-success-700 ring-success-200',
  PENDING: 'bg-warning-50 text-warning-700 ring-warning-200',
  UPCOMING: 'bg-info-50 text-info-700 ring-info-100',
  INACTIVE: 'bg-slate-100 text-slate-600 ring-slate-200',
  DISABLED: 'bg-slate-100 text-slate-600 ring-slate-200',
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-200',
  COMPLETED: 'bg-slate-100 text-slate-600 ring-slate-200',
  SUSPENDED: 'bg-red-50 text-red-700 ring-red-200',
  REVOKED: 'bg-red-50 text-red-700 ring-red-200',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-200',
  REVERSED: 'bg-red-50 text-red-700 ring-red-200',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
};

const DOT_CLASSES: Record<string, string> = {
  ACTIVE: 'bg-success-600',
  CONFIRMED: 'bg-success-600',
  VERIFIED: 'bg-success-600',
  PENDING: 'bg-warning-600',
  UPCOMING: 'bg-info-600',
  INACTIVE: 'bg-slate-400',
  DISABLED: 'bg-slate-400',
  DRAFT: 'bg-slate-400',
  COMPLETED: 'bg-slate-400',
  SUSPENDED: 'bg-red-600',
  REVOKED: 'bg-red-600',
  CANCELLED: 'bg-red-600',
  REVERSED: 'bg-red-600',
  REJECTED: 'bg-red-600',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        STATUS_CLASSES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[status] ?? 'bg-slate-400')} />
      {status}
    </span>
  );
}
