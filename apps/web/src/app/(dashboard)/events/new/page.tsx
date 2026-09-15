'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CalendarPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { OrgUnit } from '@/lib/types';
import { EventTargetLevel } from '@/lib/event-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';

const LEVEL_LABELS: Record<EventTargetLevel, string> = {
  DISTRICT: 'District-wide',
  LGA: 'LGA-wide',
  WARD: 'Ward-wide',
  POLLING_UNIT: 'Polling Unit',
};

// Only top-level admins may pick DISTRICT/LGA — the backend enforces this too.
const LEVELS_BY_ROLE: Record<string, EventTargetLevel[]> = {
  SUPER_ADMIN: ['DISTRICT', 'LGA', 'WARD', 'POLLING_UNIT'],
  STATE_ADMIN: ['DISTRICT', 'LGA', 'WARD', 'POLLING_UNIT'],
  SENATORIAL_ADMIN: ['DISTRICT', 'LGA', 'WARD', 'POLLING_UNIT'],
  LGA_ADMIN: ['LGA', 'WARD', 'POLLING_UNIT'],
  WARD_ADMIN: ['WARD', 'POLLING_UNIT'],
};

export default function CreateEventPage() {
  const router = useRouter();
  const { user } = useAuth();
  const showToast = useToast();

  const availableLevels = LEVELS_BY_ROLE[user?.role ?? ''] ?? ['WARD', 'POLLING_UNIT'];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [targetLevel, setTargetLevel] = useState<EventTargetLevel>(availableLevels[0]);
  const [lgaId, setLgaId] = useState('');
  const [wardId, setWardId] = useState('');
  const [pollingUnitId, setPollingUnitId] = useState('');
  const [lgas, setLgas] = useState<OrgUnit[]>([]);
  const [wards, setWards] = useState<OrgUnit[]>([]);
  const [pollingUnits, setPollingUnits] = useState<OrgUnit[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<OrgUnit[]>('/organization/lgas').then(setLgas).catch(() => setLgas([]));
  }, []);

  useEffect(() => {
    setWards([]);
    setWardId('');
    setPollingUnitId('');
    if (!lgaId) return;
    api.get<OrgUnit[]>(`/organization/wards?lgaId=${lgaId}`).then(setWards).catch(() => setWards([]));
  }, [lgaId]);

  useEffect(() => {
    setPollingUnits([]);
    setPollingUnitId('');
    if (!wardId) return;
    api
      .get<OrgUnit[]>(`/organization/polling-units?wardId=${wardId}`)
      .then(setPollingUnits)
      .catch(() => setPollingUnits([]));
  }, [wardId]);

  const targetId =
    targetLevel === 'LGA' ? lgaId : targetLevel === 'WARD' ? wardId : targetLevel === 'POLLING_UNIT' ? pollingUnitId : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const event = await api.post<{ id: string }>('/events', {
        title,
        description: description || undefined,
        location,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        targetLevel,
        targetId: targetLevel === 'DISTRICT' ? undefined : targetId,
      });
      showToast('Event created.', 'success');
      router.push(`/events/${event.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create this event.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Create Event" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Create Event" description="Schedule a meeting, conference, or organizational activity." />
        <Card className="max-w-2xl">
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label required>Title</Label>
                <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <Label required>Location</Label>
                <Input required value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label required>Start Time</Label>
                  <Input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <Label required>End Time</Label>
                  <Input
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Audience</Label>
                <Select
                  value={targetLevel}
                  onChange={(e) => setTargetLevel(e.target.value as EventTargetLevel)}
                >
                  {availableLevels.map((level) => (
                    <option key={level} value={level}>
                      {LEVEL_LABELS[level]}
                    </option>
                  ))}
                </Select>
              </div>

              {(targetLevel === 'LGA' || targetLevel === 'WARD' || targetLevel === 'POLLING_UNIT') && (
                <div>
                  <Label required>LGA</Label>
                  <Select required value={lgaId} onChange={(e) => setLgaId(e.target.value)}>
                    <option value="">Select LGA</option>
                    {lgas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {(targetLevel === 'WARD' || targetLevel === 'POLLING_UNIT') && (
                <div>
                  <Label required>Ward</Label>
                  <Select
                    required
                    disabled={!lgaId}
                    value={wardId}
                    onChange={(e) => setWardId(e.target.value)}
                  >
                    <option value="">Select Ward</option>
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {targetLevel === 'POLLING_UNIT' && (
                <div>
                  <Label required>Polling Unit</Label>
                  <Select
                    required
                    disabled={!wardId}
                    value={pollingUnitId}
                    onChange={(e) => setPollingUnitId(e.target.value)}
                  >
                    <option value="">Select Polling Unit</option>
                    {pollingUnits.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={submitting}>
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Creating…' : 'Create Event'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
