'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Sidebar, MobileSidebar } from '@/components/layout/sidebar';
import { MobileNavProvider, useMobileNav } from '@/components/layout/mobile-nav-context';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useMobileNav();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <MobileSidebar open={open} onClose={() => setOpen(false)} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  if (!user) return null;

  return (
    <MobileNavProvider>
      <DashboardShell>{children}</DashboardShell>
    </MobileNavProvider>
  );
}
