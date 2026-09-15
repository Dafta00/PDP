'use client';

import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useMobileNav } from './mobile-nav-context';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  STATE_ADMIN: 'State Admin',
  SENATORIAL_ADMIN: 'Senatorial Admin',
  LGA_ADMIN: 'LGA Admin',
  WARD_ADMIN: 'Ward Admin',
  POLLING_UNIT_OFFICER: 'Polling Unit Officer',
  DATA_ENTRY_OFFICER: 'Data Entry Officer',
};

export function Topbar({ title }: { title: string }) {
  const { user, logout } = useAuth();
  const { setOpen } = useMobileNav();

  return (
    <header className="flex h-16 items-center justify-between border-b-2 border-brand-600/15 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ml-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <h1 className="truncate font-heading text-base font-semibold text-slate-900 sm:text-lg">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        {user && (
          <div className="hidden items-center gap-2.5 sm:flex">
            <Avatar name={user.fullName ?? user.email} size="sm" />
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{user.fullName ?? user.email}</p>
              <p className="text-xs text-slate-500">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
          </div>
        )}
        <Button variant="secondary" size="sm" onClick={() => logout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Log out</span>
        </Button>
      </div>
    </header>
  );
}
