import { cn } from '@/lib/utils';

export interface TabOption<T extends string> {
  key: T;
  label: string;
}

/**
 * Segmented tab switcher — replaces the ad-hoc pill-button markup that was
 * duplicated across verification, attendance check-in, receipt confirm, and
 * reports. Uses proper tab semantics for screen readers and keyboard users.
 */
export function TabSwitcher<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabOption<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex gap-1 rounded-md bg-slate-100 p-1 text-sm font-medium', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          type="button"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'flex-1 cursor-pointer rounded px-3 py-2 transition-colors',
            value === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
