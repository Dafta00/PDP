'use client';

import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignTask } from '@/lib/campaign-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/states';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export default function CampaignTasksPage() {
  const { campaign, hasPermission } = useCampaignCtx();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data: tasks, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-tasks', campaign?.id],
    queryFn: () => api.get<CampaignTask[]>(`/campaigns/${campaign?.id}/tasks`),
    enabled: !!campaign,
  });

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post(`/campaigns/${campaign?.id}/tasks`, {
        title,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      showToast('Task created.', 'success');
      setTitle('');
      setDueDate('');
      queryClient.invalidateQueries({ queryKey: ['campaign-tasks', campaign?.id] });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Unable to create task.');
    } finally {
      setSubmitting(false);
    }
  }

  async function complete(id: string) {
    try {
      await api.patch(`/campaigns/${campaign?.id}/tasks/${id}/complete`, {});
      queryClient.invalidateQueries({ queryKey: ['campaign-tasks', campaign?.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to complete task.', 'error');
    }
  }

  return (
    <>
      <Topbar title="Campaign Tasks" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Campaign Tasks" description="Assignments tracked to completion, scoped to your geography." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {isLoading && <LoadingState label="Loading tasks…" />}
            {error && <ErrorState description="Unable to load tasks." onRetry={() => refetch()} />}
            {tasks && (
              <TableContainer>
                <THead>
                  <Th>Task</Th>
                  <Th>Priority</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th />
                </THead>
                <TBody>
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState icon={ListChecks} title="No tasks yet" />
                      </td>
                    </tr>
                  )}
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <Td className="font-medium text-slate-800">{t.title}</Td>
                      <Td>{t.priority}</Td>
                      <Td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</Td>
                      <Td>
                        <StatusBadge status={t.status} />
                      </Td>
                      <Td className="text-right">
                        {t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && hasPermission('campaign.tasks.complete') && (
                          <Button variant="ghost" size="sm" onClick={() => complete(t.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-success-600" aria-hidden="true" />
                            Complete
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </TableContainer>
            )}
          </div>

          {hasPermission('campaign.tasks.create') && (
            <Card>
              <CardHeader>
                <CardTitle>Create Task</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSubmit} className="space-y-3">
                  <div>
                    <Label>Title</Label>
                    <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Due Date</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Creating…' : 'Create Task'}
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
