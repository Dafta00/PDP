'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { AttendanceRecord, EventListItem, EventStatus } from '@/lib/event-types';
import { PaginatedResult } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { AttendanceCheckIn } from '@/components/events/attendance-checkin';

const CAN_MANAGE = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN', 'LGA_ADMIN', 'WARD_ADMIN'];
const STATUS_OPTIONS: EventStatus[] = ['DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

function targetLabel(event: EventListItem): string {
  if (event.targetPollingUnit) return `Polling Unit — ${event.targetPollingUnit.name}`;
  if (event.targetWard) return `Ward — ${event.targetWard.name}`;
  if (event.targetLga) return `LGA — ${event.targetLga.name}`;
  return 'District-wide';
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [statusUpdating, setStatusUpdating] = useState(false);

  const { data: event, isLoading, error, refetch } = useQuery({
    queryKey: ['event', params.id],
    queryFn: () => api.get<EventListItem>(`/events/${params.id}`),
  });

  const { data: attendance, refetch: refetchAttendance } = useQuery({
    queryKey: ['event-attendance', params.id],
    queryFn: () => api.get<PaginatedResult<AttendanceRecord>>(`/events/${params.id}/attendance?pageSize=50`),
    enabled: !!event,
  });

  async function changeStatus(status: EventStatus) {
    setStatusUpdating(true);
    try {
      await api.patch(`/events/${params.id}/status`, { status });
      showToast(`Event marked ${status.toLowerCase()}.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['event', params.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update event status.', 'error');
    } finally {
      setStatusUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <>
        <Topbar title="Event" />
        <LoadingState label="Loading event…" />
      </>
    );
  }

  if (error || !event) {
    return (
      <>
        <Topbar title="Event" />
        <ErrorState title="Event not found" onRetry={() => refetch()} />
      </>
    );
  }

  const canCheckIn = event.status === 'UPCOMING' || event.status === 'ACTIVE';

  return (
    <>
      <Topbar title={event.title} />
      <div className="p-4 sm:p-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Events', href: '/events' },
            { label: event.title },
          ]}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Details</CardTitle>
              <StatusBadge status={event.status} />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {event.description && <p className="text-slate-600">{event.description}</p>}
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-slate-500">Location</span>
                <span className="font-medium text-slate-800">{event.location}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-slate-500">Starts</span>
                <span className="font-medium text-slate-800">
                  {new Date(event.startTime).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-slate-500">Ends</span>
                <span className="font-medium text-slate-800">
                  {new Date(event.endTime).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-slate-500">Audience</span>
                <span className="font-medium text-slate-800">{targetLabel(event)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Organizer</span>
                <span className="font-medium text-slate-800">{event.organizer.fullName}</span>
              </div>
            </CardContent>
          </Card>

          {user && CAN_MANAGE.includes(user.role) && (
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  disabled={statusUpdating}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) changeStatus(e.target.value as EventStatus);
                  }}
                  className="max-w-xs"
                >
                  <option value="">Change status…</option>
                  {STATUS_OPTIONS.filter((s) => s !== event.status).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Attendance ({attendance?.total ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TableContainer className="rounded-none border-0">
                <THead>
                  <Th>Member</Th>
                  <Th>Membership ID</Th>
                  <Th>Checked In</Th>
                  <Th>Method</Th>
                </THead>
                <TBody>
                  {attendance?.items.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState icon={Users} title="No check-ins yet" />
                      </td>
                    </tr>
                  )}
                  {attendance?.items.map((a) => (
                    <tr key={a.id}>
                      <Td>
                        {[a.member.firstName, a.member.middleName, a.member.surname]
                          .filter(Boolean)
                          .join(' ')}
                      </Td>
                      <Td>{a.member.membershipId}</Td>
                      <Td>{new Date(a.checkedInAt).toLocaleTimeString()}</Td>
                      <Td className="text-slate-500">{a.method}</Td>
                    </tr>
                  ))}
                </TBody>
              </TableContainer>
            </CardContent>
          </Card>
        </div>

        <div>
          <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <ClipboardCheck className="h-4 w-4 text-slate-400" aria-hidden="true" />
            Check-In
          </p>
          {canCheckIn ? (
            <AttendanceCheckIn eventId={event.id} onChecked={() => refetchAttendance()} />
          ) : (
            <p className="flex items-start gap-2 rounded-md bg-warning-50 p-3 text-sm text-warning-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Check-in is only open while the event is Upcoming or Active. This event is currently{' '}
              {event.status}.
            </p>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
