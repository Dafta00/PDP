'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, MapPinned } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth, UNRESTRICTED_ROLES } from '@/lib/auth-context';
import { scopeBreadcrumb } from '@/components/layout/scope-indicator';
import { exportToCsv } from '@/lib/csv-export';
import {
  ActivityReport,
  DistributionReport,
  MembershipReport,
  ResourceReport,
} from '@/lib/report-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { TabSwitcher } from '@/components/ui/tabs';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';

type Tab = 'membership' | 'activities' | 'resources' | 'distributions';

function TableCard({
  title,
  onExport,
  children,
}: {
  title: string;
  onExport?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {onExport && (
          <Button variant="secondary" size="sm" onClick={onExport}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export CSV
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function MembershipTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-membership'],
    queryFn: () => api.get<MembershipReport>('/reports/membership'),
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState description="Unable to load this report." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Total Members" value={data.total} />
        {data.byStatus.map((s) => (
          <StatCard key={s.status} label={s.status} value={s.count} />
        ))}
      </div>

      <TableCard
        title="By LGA"
        onExport={() => exportToCsv('membership-by-lga', data.byLga.map((l) => ({ LGA: l.name, Total: l.total })))}
      >
        <TableContainer className="rounded-none border-0">
          <THead>
            <Th>LGA</Th>
            <Th>Total</Th>
          </THead>
          <TBody>
            {data.byLga.length === 0 && (
              <tr>
                <td colSpan={2}>
                  <EmptyState title="No data in your scope" />
                </td>
              </tr>
            )}
            {data.byLga.map((l) => (
              <tr key={l.lgaId}>
                <Td>{l.name}</Td>
                <Td>{l.total}</Td>
              </tr>
            ))}
          </TBody>
        </TableContainer>
      </TableCard>

      <TableCard
        title="By Ward"
        onExport={() => exportToCsv('membership-by-ward', data.byWard.map((w) => ({ Ward: w.name, Total: w.total })))}
      >
        <TableContainer className="rounded-none border-0">
          <THead>
            <Th>Ward</Th>
            <Th>Total</Th>
          </THead>
          <TBody>
            {data.byWard.length === 0 && (
              <tr>
                <td colSpan={2}>
                  <EmptyState title="No data in your scope" />
                </td>
              </tr>
            )}
            {data.byWard.map((w) => (
              <tr key={w.wardId}>
                <Td>{w.name}</Td>
                <Td>{w.total}</Td>
              </tr>
            ))}
          </TBody>
        </TableContainer>
      </TableCard>

      <Card>
        <CardHeader>
          <CardTitle>Registration Trend (last 12 months)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.registrationTrend.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No registrations in your scope yet.</p>
          ) : (
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {data.registrationTrend.map((p) => {
                const max = Math.max(...data.registrationTrend.map((x) => x.count), 1);
                return (
                  <div key={p.month} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex h-full w-full items-end">
                      <div
                        className="w-full rounded-t bg-brand-500"
                        style={{ height: `${Math.max((p.count / max) * 100, 3)}%` }}
                        title={`${p.count} registrations`}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500">{p.month}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivitiesTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-activities'],
    queryFn: () => api.get<ActivityReport>('/reports/activities'),
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState description="Unable to load this report." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Events" value={data.totalEvents} />
        <StatCard label="Total Attendance" value={data.totalAttendance} />
        {data.eventsByStatus
          .filter((s) => s.status === 'ACTIVE' || s.status === 'UPCOMING')
          .map((s) => (
            <StatCard key={s.status} label={s.status} value={s.count} />
          ))}
      </div>

      <TableCard
        title="Top Events by Attendance"
        onExport={() =>
          exportToCsv(
            'top-events-by-attendance',
            data.topEvents.map((e) => ({ Title: e.title, Status: e.status, 'Attendance Count': e.attendanceCount })),
          )
        }
      >
        <TableContainer className="rounded-none border-0">
          <THead>
            <Th>Event</Th>
            <Th>Status</Th>
            <Th>Attendance</Th>
          </THead>
          <TBody>
            {data.topEvents.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <EmptyState title="No events in your scope" />
                </td>
              </tr>
            )}
            {data.topEvents.map((e) => (
              <tr key={e.id}>
                <Td>{e.title}</Td>
                <Td>
                  <StatusBadge status={e.status} />
                </Td>
                <Td>{e.attendanceCount}</Td>
              </tr>
            ))}
          </TBody>
        </TableContainer>
      </TableCard>
    </div>
  );
}

function ResourcesTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-resources'],
    queryFn: () => api.get<ResourceReport>('/reports/resources'),
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState description="Unable to load this report." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Resource Types" value={data.resources.length} />
        <StatCard label="Total Usage" value={data.totalUsage} />
      </div>

      <TableCard
        title="Inventory"
        onExport={() =>
          exportToCsv(
            'resource-inventory',
            data.resources.map((r) => ({
              Resource: r.name,
              Total: r.totalQuantity,
              Allocated: r.allocatedQuantity,
              Remaining: r.remainingQuantity,
            })),
          )
        }
      >
        <TableContainer className="rounded-none border-0">
          <THead>
            <Th>Resource</Th>
            <Th>Total</Th>
            <Th>Allocated</Th>
            <Th>Remaining</Th>
          </THead>
          <TBody>
            {data.resources.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState title="No resources yet" />
                </td>
              </tr>
            )}
            {data.resources.map((r) => (
              <tr key={r.id}>
                <Td>
                  {r.name} {r.unit && <span className="text-xs text-slate-400">({r.unit})</span>}
                </Td>
                <Td>{r.totalQuantity}</Td>
                <Td>{r.allocatedQuantity}</Td>
                <Td>{r.remainingQuantity}</Td>
              </tr>
            ))}
          </TBody>
        </TableContainer>
      </TableCard>

      <TableCard
        title="Allocations by LGA"
        onExport={() =>
          exportToCsv(
            'allocations-by-lga',
            data.allocationsByLga.map((l) => ({
              LGA: l.name,
              'Total Allocated': l.totalAllocated,
              'Total Remaining': l.totalRemaining,
            })),
          )
        }
      >
        <TableContainer className="rounded-none border-0">
          <THead>
            <Th>LGA</Th>
            <Th>Allocated</Th>
            <Th>Remaining</Th>
          </THead>
          <TBody>
            {data.allocationsByLga.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <EmptyState title="No allocations in your scope" />
                </td>
              </tr>
            )}
            {data.allocationsByLga.map((l) => (
              <tr key={l.lgaId}>
                <Td>{l.name}</Td>
                <Td>{l.totalAllocated}</Td>
                <Td>{l.totalRemaining}</Td>
              </tr>
            ))}
          </TBody>
        </TableContainer>
      </TableCard>
    </div>
  );
}

function DistributionsTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-distributions'],
    queryFn: () => api.get<DistributionReport>('/reports/distributions'),
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState description="Unable to load this report." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <TableCard
        title="Distributions"
        onExport={() =>
          exportToCsv(
            'distributions',
            data.distributions.map((d) => ({
              Title: d.title,
              Status: d.status,
              Resource: d.resourceName,
              Allocated: d.totalAllocated,
              Distributed: d.totalDistributed,
              Remaining: d.totalRemaining,
              Recipients: d.recipientCount,
            })),
          )
        }
      >
        <TableContainer className="rounded-none border-0">
          <THead>
            <Th>Title</Th>
            <Th>Status</Th>
            <Th>Allocated</Th>
            <Th>Distributed</Th>
            <Th>Remaining</Th>
            <Th>Recipients</Th>
          </THead>
          <TBody>
            {data.distributions.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState title="No distributions in your scope" />
                </td>
              </tr>
            )}
            {data.distributions.map((d) => (
              <tr key={d.id}>
                <Td>{d.title}</Td>
                <Td>
                  <StatusBadge status={d.status} />
                </Td>
                <Td>
                  {d.totalAllocated} {d.unit}
                </Td>
                <Td>
                  {d.totalDistributed} {d.unit}
                </Td>
                <Td>
                  {d.totalRemaining} {d.unit}
                </Td>
                <Td>{d.recipientCount}</Td>
              </tr>
            ))}
          </TBody>
        </TableContainer>
      </TableCard>

      <TableCard
        title="Recipients by LGA"
        onExport={() =>
          exportToCsv('recipients-by-lga', data.receiptsByLga.map((l) => ({ LGA: l.name, Recipients: l.count })))
        }
      >
        <TableContainer className="rounded-none border-0">
          <THead>
            <Th>LGA</Th>
            <Th>Recipients</Th>
          </THead>
          <TBody>
            {data.receiptsByLga.length === 0 && (
              <tr>
                <td colSpan={2}>
                  <EmptyState title="No confirmed receipts in your scope" />
                </td>
              </tr>
            )}
            {data.receiptsByLga.map((l) => (
              <tr key={l.lgaId}>
                <Td>{l.name}</Td>
                <Td>{l.count}</Td>
              </tr>
            ))}
          </TBody>
        </TableContainer>
      </TableCard>
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('membership');
  const { user } = useAuth();
  const isUnrestricted = user ? UNRESTRICTED_ROLES.includes(user.role) : false;
  const breadcrumb = scopeBreadcrumb(user?.scopePath);

  return (
    <>
      <Topbar title="Reports" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Reports" description="Membership, activity, resource, and distribution analytics." />

        {!isUnrestricted && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
            <MapPinned className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span>
              Showing data for <span className="font-semibold">{breadcrumb.join(' / ') || 'your scope'}</span> only.
            </span>
          </div>
        )}

        <TabSwitcher
          className="mb-6"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'membership', label: 'Membership' },
            { key: 'activities', label: 'Activities' },
            { key: 'resources', label: 'Resources' },
            { key: 'distributions', label: 'Distributions' },
          ]}
        />

        {tab === 'membership' && <MembershipTab />}
        {tab === 'activities' && <ActivitiesTab />}
        {tab === 'resources' && <ResourcesTab />}
        {tab === 'distributions' && <DistributionsTab />}
      </div>
    </>
  );
}
