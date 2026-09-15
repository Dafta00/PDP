'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { EventListItem } from '@/lib/event-types';
import { PaginatedResult } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Select, Label } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/states';
import { AttendanceCheckIn } from '@/components/events/attendance-checkin';

export default function AttendanceQuickCheckinPage() {
  const [eventId, setEventId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-events'],
    queryFn: () =>
      api.get<PaginatedResult<EventListItem>>('/events?pageSize=50').then((res) => ({
        ...res,
        items: res.items.filter((e) => e.status === 'UPCOMING' || e.status === 'ACTIVE'),
      })),
  });

  return (
    <>
      <Topbar title="Attendance" />
      <div className="mx-auto max-w-md p-4 sm:p-6">
        <PageHeader title="Attendance Check-In" description="Select an active event to check members in." />
        <Card className="mb-4">
          <CardContent>
            <Label>Event</Label>
            {isLoading && <LoadingState label="Loading events…" />}
            {data && data.items.length === 0 && (
              <p className="text-sm text-slate-400">
                No upcoming or active events right now. Ask an admin to activate an event first.
              </p>
            )}
            {data && data.items.length > 0 && (
              <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">Choose an event…</option>
                {data.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — {new Date(e.startTime).toLocaleDateString()}
                  </option>
                ))}
              </Select>
            )}
          </CardContent>
        </Card>

        {eventId && <AttendanceCheckIn eventId={eventId} />}
      </div>
    </>
  );
}
