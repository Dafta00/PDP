'use client';

import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignAttendanceEntry, CampaignEvent } from '@/lib/campaign-types';
import { Topbar } from '@/components/layout/topbar';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';

type AttendeeType = 'MEMBER' | 'VOLUNTEER' | 'GUEST';

export default function CampaignEventDetailPage() {
  const params = useParams<{ id: string }>();
  const { campaign, hasPermission } = useCampaignCtx();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data: event, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-event', campaign?.id, params.id],
    queryFn: () => api.get<CampaignEvent>(`/campaigns/${campaign?.id}/events/${params.id}`),
    enabled: !!campaign,
  });

  const { data: attendance, refetch: refetchAttendance } = useQuery({
    queryKey: ['campaign-event-attendance', campaign?.id, params.id],
    queryFn: () => api.get<CampaignAttendanceEntry[]>(`/campaigns/${campaign?.id}/events/${params.id}/attendance`),
    enabled: !!campaign && hasPermission('campaign.attendance.view'),
  });

  const [attendeeType, setAttendeeType] = useState<AttendeeType>('GUEST');
  const [guestName, setGuestName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function markComplete() {
    try {
      await api.patch(`/campaigns/${campaign?.id}/events/${params.id}`, { status: 'COMPLETED' });
      showToast('Event marked completed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['campaign-event', campaign?.id, params.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update event.', 'error');
    }
  }

  async function recordAttendance(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/campaigns/${campaign?.id}/events/${params.id}/attendance`, {
        attendeeType,
        guestName: attendeeType === 'GUEST' ? guestName : undefined,
      });
      showToast('Attendance recorded.', 'success');
      setGuestName('');
      refetchAttendance();
      queryClient.invalidateQueries({ queryKey: ['campaign-event', campaign?.id, params.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to record attendance.', 'error');
    } finally {
      setSubmitting(false);
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
        <ErrorState description="Unable to load this event." onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <>
      <Topbar title="Event" />
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Breadcrumb items={[{ label: 'Events', href: '/campaign/events' }, { label: event.title }]} />
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold text-slate-900">{event.title}</h1>
            <p className="text-sm text-slate-500">
              {event.type.replaceAll('_', ' ')} · {new Date(event.date).toLocaleString()}
              {event.venue && ` · ${event.venue}`}
            </p>
          </div>
          <StatusBadge status={event.status} />
        </div>

        {event.description && <p className="mb-4 text-sm text-slate-700">{event.description}</p>}

        <div className="mb-4 grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Expected</p>
              <p className="font-heading text-xl font-semibold text-slate-900">{event.expectedAttendance ?? '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Actual</p>
              <p className="font-heading text-xl font-semibold text-slate-900">{event.actualAttendance ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        {hasPermission('campaign.events.update') && event.status === 'SCHEDULED' && (
          <Button variant="secondary" size="sm" className="mb-4" onClick={markComplete}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Mark Completed
          </Button>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Attendance ({attendance?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!attendance || attendance.length === 0 ? (
              <EmptyState title="No attendance recorded yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {attendance.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {a.member ? `${a.member.firstName} ${a.member.surname}` : a.volunteer?.fullName ?? a.guestName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {a.attendeeType} · {new Date(a.checkInAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {hasPermission('campaign.attendance.manage') && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Record Attendance</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={recordAttendance} className="space-y-3">
                <div>
                  <Label>Attendee Type</Label>
                  <Select value={attendeeType} onChange={(e) => setAttendeeType(e.target.value as AttendeeType)}>
                    <option value="GUEST">Guest</option>
                    <option value="VOLUNTEER">Volunteer</option>
                    <option value="MEMBER">Member</option>
                  </Select>
                </div>
                {attendeeType === 'GUEST' && (
                  <div>
                    <Label>Guest Name</Label>
                    <Input required value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                  </div>
                )}
                {attendeeType !== 'GUEST' && (
                  <p className="text-xs text-slate-500">
                    Select the {attendeeType.toLowerCase()} from the Verification page or Members list, then record
                    check-in there — this quick form covers walk-in guests.
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={submitting || (attendeeType === 'GUEST' && !guestName)}>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Recording…' : 'Record Check-In'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
