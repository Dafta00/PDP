'use client';

import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartHandshake } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignVolunteer } from '@/lib/campaign-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/states';

export default function CampaignVolunteersPage() {
  const { campaign, hasPermission } = useCampaignCtx();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data: volunteers, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-volunteers', campaign?.id],
    queryFn: () => api.get<CampaignVolunteer[]>(`/campaigns/${campaign?.id}/volunteers`),
    enabled: !!campaign,
  });

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [availability, setAvailability] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post(`/campaigns/${campaign?.id}/volunteers`, { fullName, phone: phone || undefined, role: role || undefined, availability: availability || undefined });
      showToast('Volunteer added.', 'success');
      setFullName('');
      setPhone('');
      setRole('');
      setAvailability('');
      queryClient.invalidateQueries({ queryKey: ['campaign-volunteers', campaign?.id] });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Unable to add volunteer.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Volunteers" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Campaign Volunteers" description="People supporting campaign operations — separate from party membership." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {isLoading && <LoadingState label="Loading volunteers…" />}
            {error && <ErrorState description="Unable to load volunteers." onRetry={() => refetch()} />}
            {volunteers && (
              <TableContainer>
                <THead>
                  <Th>Name</Th>
                  <Th>Phone</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {volunteers.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState icon={HeartHandshake} title="No volunteers yet" />
                      </td>
                    </tr>
                  )}
                  {volunteers.map((v) => (
                    <tr key={v.id}>
                      <Td className="font-medium text-slate-800">{v.fullName}</Td>
                      <Td>{v.phone ?? '—'}</Td>
                      <Td>{v.role ?? '—'}</Td>
                      <Td>
                        <StatusBadge status={v.status} />
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </TableContainer>
            )}
          </div>

          {hasPermission('campaign.volunteers.create') && (
            <Card>
              <CardHeader>
                <CardTitle>Add Volunteer</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSubmit} className="space-y-3">
                  <div>
                    <Label>Full Name</Label>
                    <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Ward Mobilizer" />
                  </div>
                  <div>
                    <Label>Availability</Label>
                    <Input value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="e.g. Weekends" />
                  </div>
                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Adding…' : 'Add Volunteer'}
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
