'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { NAV_SECTIONS, canSeeNavItem } from './nav-config';
import { cn } from '@/lib/utils';

/**
 * The single best (longest, i.e. most specific) href match for the current
 * path — so a sibling item whose href happens to be a prefix of another's
 * (e.g. `/members` vs. `/members/new`) never lights up alongside it.
 */
function bestMatchHref(pathname: string | null, sections: typeof NAV_SECTIONS): string | null {
  let best: string | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const matches = pathname === item.href || pathname?.startsWith(item.href + '/');
      if (matches && (!best || item.href.length > best.length)) {
        best = item.href;
      }
    }
  }
  return best;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const activeHref = bestMatchHref(pathname, NAV_SECTIONS);

  return (
    <>
      <div className="relative flex h-16 shrink-0 items-center gap-2.5 overflow-hidden bg-brand-800 px-5">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-party-red" aria-hidden="true" />
        <Image
          src="/brand/pdp-logo.jpeg"
          alt="Peoples Democratic Party"
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/30"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">PDP GOMBE CENTRAL</p>
          <p className="text-xs text-brand-200">Management Platform</p>
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => canSeeNavItem(item, user?.role));
          if (items.length === 0) return null;
          return (
            <div key={section.heading ?? 'root'}>
              {section.heading && (
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {section.heading}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = item.href === activeHref;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      <Icon
                        className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-slate-400')}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <SidebarContent />
    </aside>
  );
}

/** Mobile off-canvas drawer — the sidebar is otherwise invisible below `md`. */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-lg"
      >
        <SidebarContent onNavigate={onClose} />
      </aside>
    </div>
  );
}
