'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, ShieldCheck, UserCog } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useAuth, Role } from '@/lib/auth-context';
import { assignableRoles, rankOf } from '@/lib/role-hierarchy';
import { OrgUnit } from '@/lib/types';
import { humanizeAction } from '@/lib/audit-labels';
import { Topbar } from '@/components/layout/topbar';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';

interface ScopeUnitRef {
  name: string;
}
interface AdditionalScope {
  id: string;
  senatorialDistrictId: string | null;
  lgaId: string | null;
  wardId: string | null;
  pollingUnitId: string | null;
  senatorialDistrict?: ScopeUnitRef | null;
  lga?: ScopeUnitRef | null;
  ward?: ScopeUnitRef | null;
  pollingUnit?: ScopeUnitRef | null;
}

interface UserDetail {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  senatorialDistrictId: string | null;
  lgaId: string | null;
  wardId: string | null;
  pollingUnitId: string | null;
  canCreateUsers: boolean;
  senatorialDistrict?: ScopeUnitRef | null;
  lga?: ScopeUnitRef | null;
  ward?: ScopeUnitRef | null;
  pollingUnit?: ScopeUnitRef | null;
  createdBy?: { id: string; fullName: string } | null;
  additionalScopes: AdditionalScope[];
  permissions: string[];
  createdAt: string;
  lastLoginAt: string | null;
}

interface AuditLogEntry {
  id: string;
  action: string;
  createdAt: string;
  actor: { fullName: string } | null;
  metadata: Record<string, unknown> | null;
}

interface PermissionCatalog {
  permissions: string[];
  delegable: string[];
}

function scopeBreadcrumb(u: {
  senatorialDistrict?: ScopeUnitRef | null;
  lga?: ScopeUnitRef | null;
  ward?: ScopeUnitRef | null;
  pollingUnit?: ScopeUnitRef | null;
}): string {
  const parts = [u.senatorialDistrict?.name, u.lga?.name, u.ward?.name, u.pollingUnit?.name].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : 'Statewide (unrestricted)';
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function groupPermissions(permissions: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const p of permissions) {
    const [category] = p.split('.');
    (groups[category] ??= []).push(p);
  }
  return groups;
}

/** Rank of each fixed-scope role's geography level — mirrors the Create User form's logic. */
function scopeLevelRank(role: Role): number {
  switch (role) {
    case 'SENATORIAL_ADMIN':
      return 0;
    case 'LGA_ADMIN':
      return 1;
    case 'WARD_ADMIN':
      return 2;
    case 'POLLING_UNIT_OFFICER':
      return 3;
    default:
      return -1;
  }
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const { user: actor } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: ['user', params.id],
    queryFn: () => api.get<UserDetail>(`/users/${params.id}`),
  });

  const { data: activity } = useQuery({
    queryKey: ['user-activity', params.id],
    queryFn: () => api.get<{ items: AuditLogEntry[] }>(`/audit-logs?entityType=User&entityId=${params.id}&pageSize=15`),
    enabled: !!user,
  });

  const { data: catalog } = useQuery({
    queryKey: ['permissions-catalog'],
    queryFn: () => api.get<PermissionCatalog>('/permissions/catalog'),
    enabled: actor?.role === 'SUPER_ADMIN',
  });

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [scopeIdByLevel, setScopeIdByLevel] = useState<Record<string, string>>({});
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  const isSelf = actor?.id === params.id;
  const canManage = !!actor && !isSelf && (user ? rankOf(actor.role) < rankOf(user.role) || actor.role === 'SUPER_ADMIN' : false);
  const roles = useMemo(() => (actor ? assignableRoles(actor.role) : []), [actor]);

  const targetRank = pendingRole ? scopeLevelRank(pendingRole) : -1;
  const actorRank = actor ? scopeLevelRank(actor.role) : -1;
  const showLgaSelect = targetRank >= 1 && actorRank < 1;
  const showWardSelect = targetRank >= 2 && actorRank < 2;
  const showPollingUnitSelect = targetRank >= 3 && actorRank < 3;
  const effectiveLgaId = showLgaSelect ? scopeIdByLevel.lga ?? '' : actor?.lgaId ?? '';
  const effectiveWardId = showWardSelect ? scopeIdByLevel.ward ?? '' : actor?.wardId ?? '';

  const { data: lgas } = useQuery({
    queryKey: ['lgas', actor?.senatorialDistrictId ?? 'all'],
    queryFn: () =>
      api.get<OrgUnit[]>(
        actor?.senatorialDistrictId
          ? `/organization/lgas?senatorialDistrictId=${actor.senatorialDistrictId}`
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

  function openRoleChange() {
    if (!user) return;
    setPendingRole(user.role);
    setScopeIdByLevel({});
    setRoleDialogOpen(true);
  }

  async function confirmRoleChange() {
    if (!pendingRole) return;
    setSavingRole(true);
    try {
      const body: Record<string, unknown> = { role: pendingRole };
      if (pendingRole === 'LGA_ADMIN') body.lgaId = effectiveLgaId;
      if (pendingRole === 'WARD_ADMIN') body.wardId = effectiveWardId;
      if (pendingRole === 'POLLING_UNIT_OFFICER')
        body.pollingUnitId = showPollingUnitSelect ? scopeIdByLevel.pollingUnit ?? '' : actor?.pollingUnitId;
      await api.patch(`/users/${params.id}`, body);
      showToast('Role updated.', 'success');
      setRoleDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['user', params.id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to change role.', 'error');
    } finally {
      setSavingRole(false);
    }
  }

  async function toggleStatus() {
    if (!user) return;
    try {
      await api.patch(`/users/${params.id}`, { status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' });
      showToast(user.status === 'ACTIVE' ? 'Account disabled.' : 'Account enabled.', 'success');
      queryClient.invalidateQueries({ queryKey: ['user', params.id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update status.', 'error');
    } finally {
      setStatusDialogOpen(false);
    }
  }

  async function togglePermission(permission: string, currentlyGranted: boolean) {
    try {
      if (currentlyGranted) {
        await api.delete(`/users/${params.id}/permissions/${permission}`);
      } else {
        await api.put(`/users/${params.id}/permissions/${permission}`, { grant: true });
      }
      queryClient.invalidateQueries({ queryKey: ['user', params.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update permission.', 'error');
    }
  }

  if (isLoading) {
    return (
      <>
        <Topbar title="User Profile" />
        <LoadingState label="Loading user…" />
      </>
    );
  }

  if (error || !user) {
    return (
      <>
        <Topbar title="User Profile" />
        <ErrorState description="Unable to load this user." onRetry={() => refetch()} />
      </>
    );
  }

  const permissionGroups = groupPermissions(user.permissions);

  return (
    <>
      <Topbar title="User Profile" />
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <Breadcrumb items={[{ label: 'Users & Roles', href: '/users' }, { label: user.fullName }]} />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} size="md" />
            <div>
              <h1 className="font-heading text-xl font-semibold text-slate-900">{user.fullName}</h1>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={user.status} />
            {canManage && (
              <Button variant="secondary" size="sm" onClick={() => setStatusDialogOpen(true)}>
                {user.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <CardTitle>Role &amp; Scope</CardTitle>
                </div>
                {canManage && roles.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={openRoleChange}>
                    Change Role
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between border-b border-slate-100 py-2 text-sm">
                  <span className="text-slate-500">Role</span>
                  <span className="font-medium text-slate-800">{user.role.replaceAll('_', ' ')}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                  <span className="text-slate-500">Scope</span>
                  <span className="text-right font-medium text-slate-800">{scopeBreadcrumb(user)}</span>
                </div>
                {user.role === 'POLLING_UNIT_OFFICER' && (
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-slate-500">User creation</span>
                    <span className="font-medium text-slate-800">
                      {user.canCreateUsers ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                )}

                {user.additionalScopes.length > 0 && (
                  <div className="pt-2">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Additional Scopes
                    </p>
                    <ul className="space-y-1">
                      {user.additionalScopes.map((s) => (
                        <li key={s.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
                          {scopeBreadcrumb(s)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <CardTitle>Permissions</CardTitle>
              </CardHeader>
              <CardContent>
                {user.permissions.length === 0 ? (
                  <EmptyState title="No permissions" description="This account has no effective permissions." />
                ) : (
                  <div className="space-y-4">
                    {Object.entries(permissionGroups).map(([category, perms]) => (
                      <div key={category}>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {category}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {perms.map((p) => (
                            <span
                              key={p}
                              className="inline-flex items-center rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700 ring-1 ring-inset ring-success-200"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {actor?.role === 'SUPER_ADMIN' && catalog && !isSelf && (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Grant or revoke an override
                    </p>
                    <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                      {catalog.permissions.map((p) => {
                        const granted = user.permissions.includes(p);
                        return (
                          <label
                            key={p}
                            className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                          >
                            <span className="text-slate-700">{p}</span>
                            <input
                              type="checkbox"
                              checked={granted}
                              onChange={() => togglePermission(p, granted)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
                  <span className="text-slate-500">Created by</span>
                  <span className="font-medium text-slate-800">{user.createdBy?.fullName ?? 'System'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
                  <span className="text-slate-500">Created</span>
                  <span className="font-medium text-slate-800">{formatDateTime(user.createdAt)}</span>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-slate-500">Last login</span>
                  <span className="font-medium text-slate-800">{formatDateTime(user.lastLoginAt)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <History className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!activity || activity.items.length === 0 ? (
                  <EmptyState title="No recorded activity" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {activity.items.map((entry) => (
                      <li key={entry.id} className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{humanizeAction(entry.action)}</p>
                        <p className="text-xs text-slate-500">
                          by {entry.actor?.fullName ?? 'System'} ·{' '}
                          {new Date(entry.createdAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {roleDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setRoleDialogOpen(false)} aria-hidden="true" />
          <div className="relative w-full max-w-sm rounded-md border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="font-heading text-base font-semibold text-slate-900">Change Role</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose a new role and, if required, its geographic scope. This takes effect immediately.
            </p>
            <div className="mt-4 space-y-3">
              <Select
                value={pendingRole ?? ''}
                onChange={(e) => {
                  setPendingRole(e.target.value as Role);
                  setScopeIdByLevel({});
                }}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r.replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>

              {showLgaSelect && (
                <Select
                  value={scopeIdByLevel.lga ?? ''}
                  onChange={(e) => setScopeIdByLevel((s) => ({ ...s, lga: e.target.value, ward: '', pollingUnit: '' }))}
                >
                  <option value="">Select LGA</option>
                  {lgas?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              )}
              {showWardSelect && (
                <Select
                  disabled={!effectiveLgaId}
                  value={scopeIdByLevel.ward ?? ''}
                  onChange={(e) => setScopeIdByLevel((s) => ({ ...s, ward: e.target.value, pollingUnit: '' }))}
                >
                  <option value="">Select Ward</option>
                  {wards?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              )}
              {showPollingUnitSelect && (
                <Select
                  disabled={!effectiveWardId}
                  value={scopeIdByLevel.pollingUnit ?? ''}
                  onChange={(e) => setScopeIdByLevel((s) => ({ ...s, pollingUnit: e.target.value }))}
                >
                  <option value="">Select Polling Unit</option>
                  {pollingUnits?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRoleDialogOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={confirmRoleChange} disabled={savingRole || !pendingRole}>
                {savingRole ? 'Saving…' : 'Confirm Change'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={statusDialogOpen}
        title={user.status === 'ACTIVE' ? 'Deactivate account?' : 'Reactivate account?'}
        description={
          user.status === 'ACTIVE'
            ? `${user.fullName} will immediately lose access to the platform.`
            : `${user.fullName} will regain access to the platform.`
        }
        confirmLabel={user.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        destructive={user.status === 'ACTIVE'}
        onConfirm={toggleStatus}
        onCancel={() => setStatusDialogOpen(false)}
      />
    </>
  );
}
