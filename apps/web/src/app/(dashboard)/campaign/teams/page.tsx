'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignTeam } from '@/lib/campaign-types';
import { OrgUnit, PaginatedResult } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/states';

export default function CampaignTeamsPage() {
  const { campaign, hasPermission } = useCampaignCtx();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data: teams, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-teams', campaign?.id],
    queryFn: () => api.get<CampaignTeam[]>(`/campaigns/${campaign?.id}/teams`),
    enabled: !!campaign,
  });

  const [name, setName] = useState('');
  const [teamType, setTeamType] = useState('');
  const [lgaId, setLgaId] = useState('');
  const [wardId, setWardId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error2, setError2] = useState<string | null>(null);

  const { data: lgas } = useQuery({
    queryKey: ['lgas'],
    queryFn: () => api.get<OrgUnit[]>('/organization/lgas'),
  });
  const { data: wards } = useQuery({
    queryKey: ['wards', lgaId],
    queryFn: () => api.get<OrgUnit[]>(`/organization/wards?lgaId=${lgaId}`),
    enabled: !!lgaId,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError2(null);
    setSubmitting(true);
    try {
      await api.post(`/campaigns/${campaign?.id}/teams`, { name, teamType: teamType || undefined, wardId: wardId || undefined, lgaId: !wardId ? lgaId || undefined : undefined });
      showToast('Team created.', 'success');
      setName('');
      setTeamType('');
      queryClient.invalidateQueries({ queryKey: ['campaign-teams', campaign?.id] });
    } catch (err) {
      setError2(err instanceof ApiError ? err.message : 'Unable to create team.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Campaign Teams" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Campaign Teams" description="Mobilization teams organized by geography." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {isLoading && <LoadingState label="Loading teams…" />}
            {error && <ErrorState description="Unable to load teams." onRetry={() => refetch()} />}
            {teams && (
              <TableContainer>
                <THead>
                  <Th>Team</Th>
                  <Th>Coordinator</Th>
                  <Th>Members</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {teams.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState icon={UsersRound} title="No teams yet" description="Create your first campaign team." />
                      </td>
                    </tr>
                  )}
                  {teams.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <Td>
                        <Link href={`/campaign/teams/${t.id}`} className="font-medium text-brand-700 hover:underline">
                          {t.name}
                        </Link>
                        {t.teamType && <p className="text-xs text-slate-500">{t.teamType}</p>}
                      </Td>
                      <Td>{t.coordinator?.user.fullName ?? '—'}</Td>
                      <Td>{t._count.members}</Td>
                      <Td>
                        <StatusBadge status={t.status} />
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </TableContainer>
            )}
          </div>

          {hasPermission('campaign.teams.create') && (
            <Card>
              <CardHeader>
                <CardTitle>Create Team</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSubmit} className="space-y-3">
                  <div>
                    <Label>Team Name</Label>
                    <Input required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Team Type (optional)</Label>
                    <Input value={teamType} onChange={(e) => setTeamType(e.target.value)} placeholder="e.g. Ward Mobilization" />
                  </div>
                  <div>
                    <Label>LGA (optional)</Label>
                    <Select value={lgaId} onChange={(e) => { setLgaId(e.target.value); setWardId(''); }}>
                      <option value="">Use my own scope</option>
                      {lgas?.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </Select>
                  </div>
                  {lgaId && (
                    <div>
                      <Label>Ward (optional)</Label>
                      <Select value={wardId} onChange={(e) => setWardId(e.target.value)}>
                        <option value="">Whole LGA</option>
                        {wards?.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {error2 && <p className="text-sm text-red-600">{error2}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Creating…' : 'Create Team'}
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
