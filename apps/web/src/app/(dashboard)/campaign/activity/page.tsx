'use client';

import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignActivity as CampaignActivityEntry } from '@/lib/campaign-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/states';

const TYPES = ['MEETING_HELD', 'EVENT_COMPLETED', 'TEAM_CREATED', 'VOLUNTEER_ASSIGNED', 'RESOURCE_ALLOCATED', 'TASK_COMPLETED', 'GENERAL'] as const;

export default function CampaignActivityPage() {
  const { campaign, hasPermission } = useCampaignCtx();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data: activities, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-activity', campaign?.id],
    queryFn: () => api.get<CampaignActivityEntry[]>(`/campaigns/${campaign?.id}/activity`),
    enabled: !!campaign,
  });

  const [type, setType] = useState<(typeof TYPES)[number]>('GENERAL');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/campaigns/${campaign?.id}/activity`, { type, description });
      showToast('Activity recorded.', 'success');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['campaign-activity', campaign?.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to record activity.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Campaign Activity" />
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <PageHeader title="Campaign Activity" description="Operational activity in your geographic scope." />

        {hasPermission('campaign.activity.create') && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Record Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <Label>Type</Label>
                  <Select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input required value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <Button type="submit" disabled={submitting || !description}>
                  {submitting ? 'Recording…' : 'Record'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading && <LoadingState label="Loading activity…" />}
        {error && <ErrorState description="Unable to load activity." onRetry={() => refetch()} />}
        {activities && activities.length === 0 && <EmptyState icon={Activity} title="No activity recorded yet" />}

        {activities && activities.length > 0 && (
          <ol className="relative border-l border-slate-200 pl-6">
            {activities.map((a) => (
              <li key={a.id} className="mb-6 last:mb-0">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 ring-1 ring-slate-200" />
                <p className="text-xs font-medium text-slate-400">
                  {new Date(a.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-800">{a.type.replaceAll('_', ' ')}</p>
                <p className="text-sm text-slate-600">{a.description}</p>
                {a.responsible && <p className="text-xs text-slate-400">by {a.responsible.user.fullName}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
