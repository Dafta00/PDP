'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, History, UsersRound, HeartHandshake, ListChecks, Boxes } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignDashboard } from '@/lib/campaign-types';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';

export default function CampaignOverviewPage() {
  const { campaign, membership } = useCampaignCtx();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-dashboard', campaign?.id],
    queryFn: () => api.get<CampaignDashboard>(`/campaigns/${campaign?.id}/dashboard`),
    enabled: !!campaign,
  });

  return (
    <>
      <Topbar title="Campaign Overview" />
      <div className="p-4 sm:p-6">
        <div className="mb-6">
          <h2 className="font-heading text-lg font-semibold text-slate-900">
            {campaign?.name}
          </h2>
          <p className="text-sm text-slate-500">
            {campaign?.candidateTitle} {campaign?.candidateName} — {campaign?.party} {campaign?.electionType?.toLowerCase()},{' '}
            {campaign?.electionYear}
          </p>
          {membership && (
            <p className="mt-1 text-xs text-slate-400">
              Your role: <span className="font-medium text-slate-600">{membership.role.replaceAll('_', ' ')}</span>
            </p>
          )}
        </div>

        {isLoading && <LoadingState label="Loading dashboard…" />}
        {error && <ErrorState description="Unable to load the campaign dashboard." onRetry={() => refetch()} />}

        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Active Teams" value={data.activeTeams} icon={UsersRound} tone="brand" />
              <StatCard label="Active Volunteers" value={data.activeVolunteers} icon={HeartHandshake} tone="success" />
              <StatCard
                label="Events Scheduled"
                value={data.eventsByStatus.SCHEDULED ?? 0}
                icon={CalendarClock}
                tone="default"
              />
              <StatCard
                label="Tasks Pending"
                value={(data.tasksByStatus.PENDING ?? 0) + (data.tasksByStatus.IN_PROGRESS ?? 0)}
                icon={ListChecks}
                tone="warning"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Upcoming Events</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.upcomingEvents.length === 0 ? (
                    <EmptyState icon={CalendarClock} title="No upcoming events" description="Scheduled events will appear here." />
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {data.upcomingEvents.map((e) => (
                        <li key={e.id} className="px-5 py-3">
                          <Link href={`/campaign/events/${e.id}`} className="block hover:text-brand-700">
                            <p className="text-sm font-medium text-slate-800">{e.title}</p>
                            <p className="text-xs text-slate-500">
                              {e.type.replaceAll('_', ' ')} · {new Date(e.date).toLocaleDateString()}
                              {e.venue ? ` · ${e.venue}` : ''}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <History className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.recentActivities.length === 0 ? (
                    <EmptyState title="No recent activity" />
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {data.recentActivities.map((a) => (
                        <li key={a.id} className="px-5 py-3">
                          <p className="text-sm text-slate-800">{a.description}</p>
                          <p className="text-xs text-slate-500">{new Date(a.date).toLocaleDateString()}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Boxes className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <CardTitle>Resource Status</CardTitle>
              </CardHeader>
              <CardContent>
                {data.resourceStatus.length === 0 ? (
                  <EmptyState title="No campaign resources yet" />
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {data.resourceStatus.map((r) => (
                      <div key={r.id} className="rounded-md border border-slate-200 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{r.name}</p>
                        <p className="mt-1 font-heading text-lg font-semibold text-slate-900">
                          {r.remainingQuantity.toLocaleString()}
                          <span className="text-xs font-normal text-slate-400"> / {r.totalQuantity.toLocaleString()}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
