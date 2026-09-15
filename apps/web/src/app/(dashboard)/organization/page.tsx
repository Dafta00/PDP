'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { OrgUnit } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function DrillRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-50',
      )}
    >
      {children}
      <ChevronRight className={cn('h-4 w-4', active ? 'text-brand-500' : 'text-slate-300')} aria-hidden="true" />
    </button>
  );
}

export default function OrganizationPage() {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [lgaId, setLgaId] = useState('');
  const [wardId, setWardId] = useState('');
  const [newWardName, setNewWardName] = useState('');
  const [newPuName, setNewPuName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: lgas } = useQuery({
    queryKey: ['lgas'],
    queryFn: () => api.get<OrgUnit[]>('/organization/lgas'),
  });

  const { data: wards } = useQuery({
    queryKey: ['wards', lgaId],
    queryFn: () => api.get<OrgUnit[]>(`/organization/wards?lgaId=${lgaId}`),
    enabled: !!lgaId,
  });

  const { data: pollingUnits } = useQuery({
    queryKey: ['polling-units', wardId],
    queryFn: () => api.get<OrgUnit[]>(`/organization/polling-units?wardId=${wardId}`),
    enabled: !!wardId,
  });

  async function createWard(e: FormEvent) {
    e.preventDefault();
    if (!lgaId || !newWardName.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/organization/wards', { name: newWardName.trim(), lgaId });
      setNewWardName('');
      queryClient.invalidateQueries({ queryKey: ['wards', lgaId] });
      showToast('Ward created.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to create ward.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function createPollingUnit(e: FormEvent) {
    e.preventDefault();
    if (!wardId || !newPuName.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/organization/polling-units', { name: newPuName.trim(), wardId });
      setNewPuName('');
      queryClient.invalidateQueries({ queryKey: ['polling-units', wardId] });
      showToast('Polling unit created.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to create polling unit.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Organization" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Organization"
          description="Browse the Gombe Central hierarchy and manage wards and polling units."
        />

        <div className="mb-6 flex items-center gap-4 rounded-md border border-slate-200 bg-white p-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-slate-200">
            <Image
              src="/brand/candidate.jpg"
              alt="PDP Gombe Central Gubernatorial Candidate"
              fill
              className="object-cover object-top"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Gubernatorial Candidate</p>
            <p className="text-xs text-slate-500">
              Peoples Democratic Party — Gombe Central Senatorial District
            </p>
          </div>
          <div className="hidden h-8 w-1 shrink-0 rounded-full bg-party-red sm:block" aria-hidden="true" />
          <Image
            src="/brand/pdp-logo.jpeg"
            alt="Peoples Democratic Party"
            width={36}
            height={36}
            className="hidden h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200 sm:block"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>LGAs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-slate-500">
                Verified for Gombe Central Senatorial District. Select an LGA to manage its wards.
              </p>
              <div className="space-y-1">
                {lgas?.map((lga) => (
                  <DrillRow
                    key={lga.id}
                    active={lgaId === lga.id}
                    onClick={() => {
                      setLgaId(lga.id);
                      setWardId('');
                    }}
                  >
                    {lga.name}
                  </DrillRow>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Wards {lgaId && `— ${lgas?.find((l) => l.id === lgaId)?.name}`}</CardTitle>
            </CardHeader>
            <CardContent>
              {!lgaId ? (
                <p className="text-sm text-slate-400">Select an LGA to view its wards.</p>
              ) : (
                <>
                  <div className="mb-3 space-y-1">
                    {wards?.length === 0 && (
                      <p className="text-sm text-slate-400">No wards yet. Add the first one below.</p>
                    )}
                    {wards?.map((w) => (
                      <DrillRow key={w.id} active={wardId === w.id} onClick={() => setWardId(w.id)}>
                        {w.name}
                      </DrillRow>
                    ))}
                  </div>
                  <form onSubmit={createWard} className="flex gap-2">
                    <Input
                      placeholder="New ward name"
                      value={newWardName}
                      onChange={(e) => setNewWardName(e.target.value)}
                    />
                    <Button type="submit" size="sm" disabled={submitting}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                Polling Units {wardId && `— ${wards?.find((w) => w.id === wardId)?.name}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!wardId ? (
                <p className="text-sm text-slate-400">Select a ward to view its polling units.</p>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {pollingUnits?.length === 0 && (
                      <p className="text-sm text-slate-400">No polling units yet. Add the first one below.</p>
                    )}
                    {pollingUnits?.map((p) => (
                      <div key={p.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        {p.name}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={createPollingUnit} className="flex max-w-md gap-2">
                    <Input
                      placeholder="New polling unit name"
                      value={newPuName}
                      onChange={(e) => setNewPuName(e.target.value)}
                    />
                    <Button type="submit" size="sm" disabled={submitting}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
