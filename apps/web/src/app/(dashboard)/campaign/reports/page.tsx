'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useCampaignCtx } from '@/lib/campaign-context';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { TabSwitcher } from '@/components/ui/tabs';
import { LoadingState, ErrorState } from '@/components/ui/states';

type Tab = 'events' | 'attendance' | 'teams' | 'volunteers' | 'tasks';

function CountGrid({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p className="py-4 text-center text-sm text-slate-400">No data yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-md border border-slate-200 p-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{key.replaceAll('_', ' ')}</p>
          <p className="mt-1 font-heading text-xl font-semibold text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
}

export default function CampaignReportsPage() {
  const { campaign } = useCampaignCtx();
  const [tab, setTab] = useState<Tab>('events');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-report', campaign?.id, tab],
    queryFn: () => api.get<Record<string, unknown>>(`/campaigns/${campaign?.id}/reports/${tab}`),
    enabled: !!campaign,
  });

  return (
    <>
      <Topbar title="Campaign Reports" />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <PageHeader title="Campaign Reports" description="Operational reporting, automatically scoped to your campaign geography." />

        <TabSwitcher
          className="mb-4"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          tabs={[
            { key: 'events', label: 'Events' },
            { key: 'attendance', label: 'Attendance' },
            { key: 'teams', label: 'Teams' },
            { key: 'volunteers', label: 'Volunteers' },
            { key: 'tasks', label: 'Tasks' },
          ]}
        />

        <Card>
          <CardContent>
            {isLoading && <LoadingState label="Loading report…" />}
            {error && <ErrorState description="Unable to load this report." onRetry={() => refetch()} />}
            {data && (
              <div className="space-y-4">
                {Object.entries(data).map(([section, value]) => {
                  if (typeof value === 'number') {
                    return (
                      <div key={section} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                        <span className="text-slate-500">{section === 'total' ? 'Total' : section.replaceAll(/([A-Z])/g, ' $1')}</span>
                        <span className="font-heading text-lg font-semibold text-slate-900">{value}</span>
                      </div>
                    );
                  }
                  if (value && typeof value === 'object') {
                    return (
                      <div key={section}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {section.replace(/([A-Z])/g, ' $1')}
                        </p>
                        <CountGrid data={value as Record<string, number>} />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
