'use client';

import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignTeam, CampaignVolunteer } from '@/lib/campaign-types';
import { Topbar } from '@/components/layout/topbar';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';

export default function CampaignTeamDetailPage() {
  const params = useParams<{ id: string }>();
  const { campaign, hasPermission } = useCampaignCtx();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data: team, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-team', campaign?.id, params.id],
    queryFn: () => api.get<CampaignTeam>(`/campaigns/${campaign?.id}/teams/${params.id}`),
    enabled: !!campaign,
  });

  const { data: volunteers } = useQuery({
    queryKey: ['campaign-volunteers', campaign?.id],
    queryFn: () => api.get<CampaignVolunteer[]>(`/campaigns/${campaign?.id}/volunteers`),
    enabled: !!campaign && hasPermission('campaign.teams.manage'),
  });

  const [volunteerId, setVolunteerId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!volunteerId) return;
    setSubmitting(true);
    try {
      await api.post(`/campaigns/${campaign?.id}/teams/${params.id}/members`, { volunteerId });
      showToast('Member added.', 'success');
      setVolunteerId('');
      queryClient.invalidateQueries({ queryKey: ['campaign-team', campaign?.id, params.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to add member.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeMember(memberId: string) {
    try {
      await api.delete(`/campaigns/${campaign?.id}/teams/${params.id}/members/${memberId}`);
      queryClient.invalidateQueries({ queryKey: ['campaign-team', campaign?.id, params.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to remove member.', 'error');
    }
  }

  if (isLoading) {
    return (
      <>
        <Topbar title="Team" />
        <LoadingState label="Loading team…" />
      </>
    );
  }
  if (error || !team) {
    return (
      <>
        <Topbar title="Team" />
        <ErrorState description="Unable to load this team." onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <>
      <Topbar title="Team" />
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Breadcrumb items={[{ label: 'Teams', href: '/campaign/teams' }, { label: team.name }]} />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold text-slate-900">{team.name}</h1>
            <p className="text-sm text-slate-500">{team.teamType ?? 'Campaign team'}</p>
          </div>
          <StatusBadge status={team.status} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Members ({team.members?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!team.members || team.members.length === 0 ? (
              <EmptyState title="No members yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {team.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {m.membership?.user.fullName ?? m.volunteer?.fullName}
                      </p>
                      {m.roleInTeam && <p className="text-xs text-slate-500">{m.roleInTeam}</p>}
                    </div>
                    {hasPermission('campaign.teams.manage') && (
                      <Button variant="ghost" size="sm" onClick={() => removeMember(m.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {hasPermission('campaign.teams.manage') && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Add Volunteer to Team</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={addMember} className="flex gap-2">
                <Select value={volunteerId} onChange={(e) => setVolunteerId(e.target.value)} className="flex-1">
                  <option value="">Select volunteer</option>
                  {volunteers?.map((v) => (
                    <option key={v.id} value={v.id}>{v.fullName}</option>
                  ))}
                </Select>
                <Button type="submit" disabled={submitting || !volunteerId}>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
