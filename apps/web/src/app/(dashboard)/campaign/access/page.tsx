'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignMembership } from '@/lib/campaign-types';
import { CampaignRole } from '@/lib/campaign-types';
import { assignableCampaignRoles, campaignScopeLevelRank, humanCampaignRole } from '@/lib/campaign-role-hierarchy';
import { useAuth } from '@/lib/auth-context';
import { OrgUnit } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/states';

export default function CampaignAccessPage() {
  const { campaign, membership: actorMembership, hasPermission } = useCampaignCtx();
  const { user: authUser } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data: members, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-users', campaign?.id],
    queryFn: () => api.get<CampaignMembership[]>(`/campaigns/${campaign?.id}/users`),
    enabled: !!campaign && hasPermission('campaign.users.view'),
  });

  const roles = useMemo(() => (actorMembership ? assignableCampaignRoles(actorMembership.role) : []), [actorMembership]);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<CampaignRole>('REPORT_VIEWER');
  useEffect(() => {
    if (roles.length > 0 && !roles.includes(role)) setRole(roles[0]);
  }, [roles, role]);

  const actorRank = actorMembership ? campaignScopeLevelRank(actorMembership.role) : -1;
  const targetRank = campaignScopeLevelRank(role);
  const showLgaSelect = targetRank >= 1 && actorRank < 1;
  const showWardSelect = targetRank >= 2 && actorRank < 2;
  const showPollingUnitSelect = targetRank >= 3 && actorRank < 3;

  const [scopeIds, setScopeIds] = useState<Record<string, string>>({});
  const effectiveLgaId = showLgaSelect ? scopeIds.lga ?? '' : actorMembership?.lgaId ?? '';
  const effectiveWardId = showWardSelect ? scopeIds.ward ?? '' : actorMembership?.wardId ?? '';

  const { data: lgas } = useQuery({
    queryKey: ['lgas', actorMembership?.senatorialDistrictId ?? 'all'],
    queryFn: () =>
      api.get<OrgUnit[]>(
        actorMembership?.senatorialDistrictId
          ? `/organization/lgas?senatorialDistrictId=${actorMembership.senatorialDistrictId}`
          : '/organization/lgas',
      ),
    enabled: showLgaSelect,
  });
  const { data: wards } = useQuery({
    queryKey: ['wards', effectiveLgaId],
    queryFn: () => api.get<OrgUnit[]>(`/organization/wards?lgaId=${effectiveLgaId}`),
    enabled: showWardSelect && !!effectiveLgaId,
  });
  const { data: pollingUnits } = useQuery({
    queryKey: ['polling-units', effectiveWardId],
    queryFn: () => api.get<OrgUnit[]>(`/organization/polling-units?wardId=${effectiveWardId}`),
    enabled: showPollingUnitSelect && !!effectiveWardId,
  });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { userId, role };
      if (role === 'DISTRICT_COORDINATOR') body.senatorialDistrictId = actorMembership?.senatorialDistrictId ?? scopeIds.district;
      if (role === 'LGA_COORDINATOR') body.lgaId = effectiveLgaId;
      if (role === 'WARD_COORDINATOR') body.wardId = effectiveWardId;
      if (role === 'POLLING_UNIT_COORDINATOR') body.pollingUnitId = showPollingUnitSelect ? scopeIds.pollingUnit : actorMembership?.pollingUnitId;

      await api.post(`/campaigns/${campaign?.id}/users`, body);
      showToast('Campaign role assigned.', 'success');
      setUserId('');
      queryClient.invalidateQueries({ queryKey: ['campaign-users', campaign?.id] });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Unable to assign campaign role.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(m: CampaignMembership) {
    try {
      await api.patch(`/campaigns/${campaign?.id}/users/${m.id}`, { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' });
      queryClient.invalidateQueries({ queryKey: ['campaign-users', campaign?.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update.', 'error');
    }
  }

  return (
    <>
      <Topbar title="Campaign Access" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Campaign Access"
          description="Campaign roles and scope — independent of each user's administrative role on the main platform."
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {isLoading && <LoadingState label="Loading campaign users…" />}
            {error && <ErrorState description="Unable to load campaign users." onRetry={() => refetch()} />}
            {members && (
              <TableContainer>
                <THead>
                  <Th>User</Th>
                  <Th>Campaign Role</Th>
                  <Th>Status</Th>
                  <Th />
                </THead>
                <TBody>
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState title="No campaign users in your scope" />
                      </td>
                    </tr>
                  )}
                  {members.map((m) => (
                    <tr key={m.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={m.user.fullName} size="sm" />
                          <div>
                            <p className="font-medium text-slate-800">{m.user.fullName}</p>
                            <p className="text-xs text-slate-500">{m.user.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>{humanCampaignRole(m.role)}</Td>
                      <Td>
                        <StatusBadge status={m.status} />
                      </Td>
                      <Td className="text-right">
                        {hasPermission('campaign.users.deactivate') && m.userId !== authUser?.id && (
                          <Button variant="ghost" size="sm" onClick={() => toggleStatus(m)}>
                            {m.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </TableContainer>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Assign Campaign Role</CardTitle>
            </CardHeader>
            <CardContent>
              {roles.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <ShieldAlert className="h-6 w-6 text-slate-300" aria-hidden="true" />
                  <p className="text-sm text-slate-500">Your campaign role isn&apos;t authorized to assign others.</p>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-3">
                  <div>
                    <Label>User ID</Label>
                    <Input required value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Existing platform user id" />
                    <p className="mt-1 text-xs text-slate-400">Find the user&apos;s id from Users &amp; Roles.</p>
                  </div>
                  <div>
                    <Label>Campaign Role</Label>
                    <Select value={role} onChange={(e) => setRole(e.target.value as CampaignRole)}>
                      {roles.map((r) => (
                        <option key={r} value={r}>{humanCampaignRole(r)}</option>
                      ))}
                    </Select>
                  </div>
                  {showLgaSelect && (
                    <div>
                      <Label>LGA</Label>
                      <Select required value={scopeIds.lga ?? ''} onChange={(e) => setScopeIds((s) => ({ ...s, lga: e.target.value, ward: '', pollingUnit: '' }))}>
                        <option value="">Select LGA</option>
                        {lgas?.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {showWardSelect && (
                    <div>
                      <Label>Ward</Label>
                      <Select required disabled={!effectiveLgaId} value={scopeIds.ward ?? ''} onChange={(e) => setScopeIds((s) => ({ ...s, ward: e.target.value, pollingUnit: '' }))}>
                        <option value="">Select Ward</option>
                        {wards?.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {showPollingUnitSelect && (
                    <div>
                      <Label>Polling Unit</Label>
                      <Select required disabled={!effectiveWardId} value={scopeIds.pollingUnit ?? ''} onChange={(e) => setScopeIds((s) => ({ ...s, pollingUnit: e.target.value }))}>
                        <option value="">Select Polling Unit</option>
                        {pollingUnits?.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    {submitting ? 'Assigning…' : 'Assign Role'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
