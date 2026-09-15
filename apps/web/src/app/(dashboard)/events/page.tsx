'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, Clock, MapPin, Users } from 'lucide-react';
import { api } from '@/lib/api-client';
import { EventListItem, EventStatus } from '@/lib/event-types';
import { PaginatedResult } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';

const STATUS_OPTIONS: (EventStatus | 'ALL')[] = [
  'ALL',
  'DRAFT',
  'UPCOMING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
];

function targetLabel(event: EventListItem): string {
  if (event.targetPollingUnit) return event.targetPollingUnit.name;
  if (event.targetWard) return event.targetWard.name;
  if (event.targetLga) return event.targetLga.name;
  return 'District-wide';
}

export default function EventsPage() {
  const [status, setStatus] = useState<EventStatus | 'ALL'>('ALL');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['events', status],
    queryFn: () => {
      const params = new URLSearchParams({ pageSize: '50' });
      if (status !== 'ALL') params.set('status', status);
      return api.get<PaginatedResult<EventListItem>>(`/events?${params.toString()}`);
    },
  });

  return (
    <>
      <Topbar title="Events" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Events"
          description="Manage meetings, conferences, and organizational activities."
          actions={
            <Link href="/events/new">
              <Button>
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                Create Event
              </Button>
            </Link>
          }
        />

        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as EventStatus | 'ALL')}
          className="mb-4 max-w-[180px]"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'ALL' ? 'All statuses' : s}
            </option>
          ))}
        </Select>

        {isLoading && <LoadingState label="Loading events…" />}
        {error && <ErrorState description="Unable to load events." onRetry={() => refetch()} />}
        {data && data.items.length === 0 && (
          <EmptyState icon={CalendarDays} title="No events found" description="Create an event to get started." />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`}>
              <Card className="h-full transition-colors hover:border-brand-300">
                <CardContent>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-heading font-semibold text-slate-900">{event.title}</p>
                    <StatusBadge status={event.status} />
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {new Date(event.startTime).toLocaleString()}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    {event.location}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>{targetLabel(event)}</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      {event._count.attendances}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
