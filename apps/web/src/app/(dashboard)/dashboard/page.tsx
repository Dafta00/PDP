'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users, UserCheck, Clock, CalendarDays, UserPlus, ShieldCheck, CalendarPlus, MapPinned } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth, UNRESTRICTED_ROLES } from '@/lib/auth-context';
import { humanizeAction, SESSION_ACTIONS } from '@/lib/audit-labels';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { OrgUnit } from '@/lib/types';

interface DistrictBreakdown {
  id: string;
  name: string;
  lgaCount: number;
  totalMembers: number;
}

interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  pendingMembers: number;
  lgas: number;
  wards: number;
  pollingUnits: number;
  upcomingEvents: number;
  registrationTrend: { month: string; count: number }[];
  districtBreakdown: DistrictBreakdown[];
}

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actor: { fullName: string } | null;
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN'];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof UserPlus;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-brand-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
      <span className="text-sm font-medium text-slate-800">{label}</span>
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user ? ADMIN_ROLES.includes(user.role) : false;
  const isUnrestricted = user ? UNRESTRICTED_ROLES.includes(user.role) : false;
  const isDistrictScoped = user?.role === 'SENATORIAL_ADMIN';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/dashboard/stats'),
  });

  const { data: scopedLgas } = useQuery({
    queryKey: ['dashboard-scoped-lgas'],
    queryFn: () => api.get<OrgUnit[]>('/organization/lgas'),
    enabled: isDistrictScoped,
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['dashboard-recent-activity'],
    queryFn: () =>
      api
        .get<{ items: AuditLogEntry[] }>('/audit-logs?pageSize=20')
        .then((res) => res.items.filter((e) => !SESSION_ACTIONS.has(e.action)).slice(0, 5)),
    enabled: isAdmin,
  });

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="p-4 sm:p-6">
        <div className="mb-6">
          <h2 className="font-heading text-lg font-semibold text-slate-900">
            {greeting()}, {user?.fullName?.split(' ')[0] ?? 'Administrator'}
          </h2>
          <p className="text-sm text-slate-500">
            {isUnrestricted
              ? 'PDP Gombe State — State Overview'
              : isDistrictScoped
                ? `${user?.scopePath?.senatorialDistrict?.name ?? 'Your district'} — Administrative Scope`
                : 'Overview of Gombe State operations.'}
          </p>
        </div>

        {isDistrictScoped && (
          <Card className="mb-6 border-brand-200 bg-brand-50">
            <CardContent className="flex flex-wrap items-center gap-3 py-4">
              <MapPinned className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
              <p className="font-heading text-base font-semibold text-brand-800">
                {user?.scopePath?.senatorialDistrict?.name ?? 'Your district'}
              </p>
              <span className="text-brand-300">·</span>
              <div className="flex flex-wrap gap-1.5">
                {scopedLgas?.map((lga) => (
                  <span
                    key={lga.id}
                    className="rounded-full border border-brand-200 bg-white px-2.5 py-0.5 text-xs font-medium text-brand-700"
                  >
                    {lga.name}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading && <LoadingState label="Loading dashboard…" />}
        {error && <ErrorState description="Unable to load dashboard statistics." onRetry={() => refetch()} />}

        {data && (
          <div className="space-y-6">
            {isUnrestricted && data.districtBreakdown.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Senatorial Districts
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {data.districtBreakdown.map((district) => (
                    <Link
                      key={district.id}
                      href={`/members?senatorialDistrictId=${district.id}`}
                      className="rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-brand-50"
                    >
                      <p className="font-heading text-sm font-semibold text-slate-900">{district.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{district.lgaCount} LGAs</p>
                      <p className="mt-2 font-heading text-2xl font-semibold text-brand-700">
                        {district.totalMembers.toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500">members</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Total Members" value={data.totalMembers} icon={Users} tone="default" />
              <StatCard label="Active Members" value={data.activeMembers} icon={UserCheck} tone="success" />
              <StatCard label="Pending Verification" value={data.pendingMembers} icon={Clock} tone="warning" />
              <StatCard label="Upcoming Events" value={data.upcomingEvents} icon={CalendarDays} tone="default" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Organizational Coverage</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">LGAs</dt>
                    <dd className="mt-1 font-heading text-xl font-semibold text-slate-900">{data.lgas}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Wards</dt>
                    <dd className="mt-1 font-heading text-xl font-semibold text-slate-900">{data.wards}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Polling Units
                    </dt>
                    <dd className="mt-1 font-heading text-xl font-semibold text-slate-900">
                      {data.pollingUnits}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Membership Registration Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.registrationTrend.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">No registrations recorded yet.</p>
                  ) : (
                    <div className="flex items-end gap-3" style={{ height: 140 }}>
                      {data.registrationTrend.map((point) => {
                        const max = Math.max(...data.registrationTrend.map((p) => p.count), 1);
                        const heightPct = (point.count / max) * 100;
                        return (
                          <div key={point.month} className="flex flex-1 flex-col items-center gap-1.5">
                            <div className="flex h-full w-full items-end">
                              <div
                                className="w-full rounded-t bg-brand-500"
                                style={{ height: `${Math.max(heightPct, 3)}%` }}
                                title={`${point.count} registrations`}
                              />
                            </div>
                            <p className="text-[11px] text-slate-500">{point.month}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <QuickAction href="/members/new" icon={UserPlus} label="Register Member" />
                  <QuickAction href="/verification" icon={ShieldCheck} label="Verify Member" />
                  <QuickAction href="/events/new" icon={CalendarPlus} label="Create Event" />
                </CardContent>
              </Card>
            </div>

            {isAdmin && recentActivity && recentActivity.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y divide-slate-100">
                    {recentActivity.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3">
                        <div>
                          <p className="text-sm capitalize text-slate-800">{humanizeAction(entry.action)}</p>
                          <p className="text-xs text-slate-500">by {entry.actor?.fullName ?? 'System'}</p>
                        </div>
                        <p className="shrink-0 text-xs text-slate-400">
                          {new Date(entry.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
