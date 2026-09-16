'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignEvent, CampaignEventType } from '@/lib/campaign-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/states';

const EVENT_TYPES: CampaignEventType[] = [
  'RALLY', 'TOWN_HALL', 'WARD_MEETING', 'LGA_MEETING', 'DISTRICT_MEETING',
  'STAKEHOLDER_MEETING', 'VOLUNTEER_TRAINING', 'COMMUNITY_OUTREACH', 'INTERNAL_PARTY_MEETING',
];

export default function CampaignEventsPage() {
  const { campaign, hasPermission } = useCampaignCtx();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-events', campaign?.id],
    queryFn: () => api.get<CampaignEvent[]>(`/campaigns/${campaign?.id}/events`),
    enabled: !!campaign,
  });

  const [title, setTitle] = useState('');
  const [type, setType] = useState<CampaignEventType>('RALLY');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post(`/campaigns/${campaign?.id}/events`, { title, type, date: new Date(date).toISOString(), venue: venue || undefined });
      showToast('Event created.', 'success');
      setTitle('');
      setVenue('');
      setDate('');
      queryClient.invalidateQueries({ queryKey: ['campaign-events', campaign?.id] });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Unable to create event.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Campaign Events" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Campaign Events" description="Rallies, meetings, trainings, and outreach." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {isLoading && <LoadingState label="Loading events…" />}
            {error && <ErrorState description="Unable to load events." onRetry={() => refetch()} />}
            {events && (
              <TableContainer>
                <THead>
                  <Th>Event</Th>
                  <Th>Type</Th>
                  <Th>Date</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {events.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState icon={CalendarClock} title="No events yet" />
                      </td>
                    </tr>
                  )}
                  {events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <Td>
                        <Link href={`/campaign/events/${ev.id}`} className="font-medium text-brand-700 hover:underline">
                          {ev.title}
                        </Link>
                        {ev.venue && <p className="text-xs text-slate-500">{ev.venue}</p>}
                      </Td>
                      <Td>{ev.type.replaceAll('_', ' ')}</Td>
                      <Td>{new Date(ev.date).toLocaleDateString()}</Td>
                      <Td>
                        <StatusBadge status={ev.status} />
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </TableContainer>
            )}
          </div>

          {hasPermission('campaign.events.create') && (
            <Card>
              <CardHeader>
                <CardTitle>Create Event</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSubmit} className="space-y-3">
                  <div>
                    <Label>Title</Label>
                    <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={type} onChange={(e) => setType(e.target.value as CampaignEventType)}>
                      {EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input required type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Venue</Label>
                    <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
                  </div>
                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Creating…' : 'Create Event'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
