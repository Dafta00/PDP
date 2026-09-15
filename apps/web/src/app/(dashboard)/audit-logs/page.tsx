'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api } from '@/lib/api-client';
import { humanizeAction } from '@/lib/audit-labels';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingState } from '@/components/ui/states';

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: { fullName: string; email: string } | null;
  metadata: Record<string, unknown> | null;
}

const PAGE_SIZE = 25;

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () =>
      api.get<{ items: AuditLogEntry[]; total: number }>(
        `/audit-logs?page=${page}&pageSize=${PAGE_SIZE}`,
      ),
  });

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;

  return (
    <>
      <Topbar title="Audit Logs" />
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <PageHeader title="Audit Logs" description="An immutable record of every administrative action." />

        {isLoading && <LoadingState label="Loading audit logs…" />}
        {data?.items.length === 0 && <EmptyState icon={History} title="No audit entries yet" />}

        {data && data.items.length > 0 && (
          <ol className="relative border-l border-slate-200 pl-6">
            {data.items.map((entry) => (
              <li key={entry.id} className="mb-6 last:mb-0">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 ring-1 ring-slate-200" />
                <p className="text-xs font-medium text-slate-400">
                  {new Date(entry.createdAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="mt-0.5 text-sm font-medium capitalize text-slate-800">
                  {humanizeAction(entry.action)}
                </p>
                <p className="text-xs text-slate-500">
                  by {entry.actor ? entry.actor.fullName : 'System'}
                  {entry.entityId && ` · ${entry.entityType} ${entry.entityId.slice(0, 8)}…`}
                </p>
              </li>
            ))}
          </ol>
        )}

        {data && data.total > 0 && (
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
