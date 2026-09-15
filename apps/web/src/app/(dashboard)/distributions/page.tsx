'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { DistributionItem } from '@/lib/distribution-types';
import { ResourceItem } from '@/lib/resource-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, LoadingState } from '@/components/ui/states';

const CAN_MANAGE = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN'];

export default function DistributionsPage() {
  const { user } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: distributions, isLoading } = useQuery({
    queryKey: ['distributions'],
    queryFn: () => api.get<DistributionItem[]>('/distributions'),
  });

  const { data: resources } = useQuery({
    queryKey: ['resources'],
    queryFn: () => api.get<ResourceItem[]>('/resources'),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !resourceId) return;
    setSubmitting(true);
    try {
      await api.post('/distributions', {
        title: title.trim(),
        description: description.trim() || undefined,
        resourceId,
      });
      showToast('Distribution created.', 'success');
      setTitle('');
      setDescription('');
      setResourceId('');
      queryClient.invalidateQueries({ queryKey: ['distributions'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create distribution.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Distributions" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Distributions" description="Member-facing campaigns distributing allocated resources." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading && <LoadingState label="Loading distributions…" />}
          {distributions?.length === 0 && (
            <EmptyState icon={Truck} title="No distributions yet" description="Create a distribution to get started." />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {distributions?.map((d) => (
              <Link key={d.id} href={`/distributions/${d.id}`}>
                <Card className="h-full transition-colors hover:border-brand-300">
                  <CardContent>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-900">{d.title}</p>
                      <StatusBadge status={d.status} />
                    </div>
                    <p className="text-sm text-slate-500">
                      {d.resource.name} {d.resource.unit && `(${d.resource.unit})`}
                    </p>
                    {d.description && <p className="mt-1 text-sm text-slate-600">{d.description}</p>}
                    <p className="mt-2 text-xs text-slate-400">Organized by {d.organizer.fullName}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {user && CAN_MANAGE.includes(user.role) && (
          <Card>
            <CardHeader>
              <CardTitle>New Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Ramadan Food Support"
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div>
                  <Label>Resource</Label>
                  <Select required value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                    <option value="">Select resource</option>
                    {resources?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.remainingQuantity} {r.unit} unallocated)
                      </option>
                    ))}
                  </Select>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Distribution'}
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
