'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { OrgUnit, PaginatedResult } from '@/lib/types';
import { Role, useAuth } from '@/lib/auth-context';
import { assignableRoles } from '@/lib/role-hierarchy';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';

interface AdminUser {
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
  senatorialDistrict?: { name: string } | null;
  lga?: { name: string } | null;
  ward?: { name: string } | null;
  pollingUnit?: { name: string } | null;
  createdBy?: { id: string; fullName: string } | null;
  lastLoginAt: string | null;
  createdAt: string;
}

function scopeLabel(u: AdminUser): string {
  return u.pollingUnit?.name ?? u.ward?.name ?? u.lga?.name ?? u.senatorialDistrict?.name ?? '—';
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Rank of each fixed-scope role's geography level — 0 (broadest) to 3 (narrowest). -1 = unrestricted. */
function actorLevelRank(role: Role): number {
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

export default function UsersPage() {
  const { user: actor } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [grantCreateUsers, setGrantCreateUsers] = useState(false);

  // Only ever used for levels the actor's own scope doesn't already imply —
  // see `showLgaSelect`/`showWardSelect`/`showPollingUnitSelect` below.
  const [senatorialDistrictId, setSenatorialDistrictId] = useState('');
  const [lgaId, setLgaId] = useState('');
  const [wardId, setWardId] = useState('');
  const [pollingUnitId, setPollingUnitId] = useState('');

  const actorRank = actor ? actorLevelRank(actor.role) : -1;

  // A Polling Unit Officer without the (Super Admin-granted) permission has
  // nothing they're allowed to create — the roles list collapses to empty
  // and the create form is hidden entirely, rather than offering a form
  // that the backend will reject every time.
  const roles = useMemo(() => {
    if (!actor) return [];
    if (actor.role === 'POLLING_UNIT_OFFICER' && !actor.canCreateUsers) return [];
    return assignableRoles(actor.role);
  }, [actor]);

  const [role, setRole] = useState<Role>('DATA_ENTRY_OFFICER');
  useEffect(() => {
    if (roles.length > 0 && !roles.includes(role)) setRole(roles[0]);
  }, [roles, role]);

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<PaginatedResult<AdminUser>>('/users'),
  });

  const targetRank = actorLevelRank(role);
  const showDistrictSelect = role === 'SENATORIAL_ADMIN'; // only ever reachable by an unrestricted actor
  const showLgaSelect = (targetRank >= 1 || role === 'DATA_ENTRY_OFFICER') && actorRank < 1;
  const showWardSelect = (targetRank >= 2 || role === 'DATA_ENTRY_OFFICER') && actorRank < 2;
  const showPollingUnitSelect = (targetRank >= 3 || role === 'DATA_ENTRY_OFFICER') && actorRank < 3;

  // The nearest ancestor id a select needs to filter its options by, whether
  // that comes from the actor's own (implied, hidden) scope or from a
  // shown-and-chosen sibling select above it.
  const effectiveDistrictId = showDistrictSelect ? senatorialDistrictId : actor?.senatorialDistrictId ?? '';
  const effectiveLgaId = showLgaSelect ? lgaId : actor?.lgaId ?? '';
  const effectiveWardId = showWardSelect ? wardId : actor?.wardId ?? '';
  const effectivePollingUnitId = showPollingUnitSelect ? pollingUnitId : actor?.pollingUnitId ?? '';

  const { data: districts } = useQuery({
    queryKey: ['senatorial-districts'],
    queryFn: () => api.get<OrgUnit[]>('/organization/senatorial-districts'),
    enabled: showDistrictSelect,
  });
  const { data: lgas } = useQuery({
    queryKey: ['lgas', effectiveDistrictId],
    queryFn: () =>
      api.get<OrgUnit[]>(
        effectiveDistrictId ? `/organization/lgas?senatorialDistrictId=${effectiveDistrictId}` : '/organization/lgas',
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

  useEffect(() => {
    setSenatorialDistrictId('');
    setLgaId('');
    setWardId('');
    setPollingUnitId('');
    setGrantCreateUsers(false);
  }, [role]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // A scoped actor's implied levels are never sent as picked values —
      // the backend independently re-derives and re-validates all of this
      // from the actor's own account regardless of what's sent here.
      const body: Record<string, unknown> = { email, password, fullName, role };
      if (role === 'SENATORIAL_ADMIN') body.senatorialDistrictId = senatorialDistrictId;
      if (role === 'LGA_ADMIN') body.lgaId = effectiveLgaId;
      if (role === 'WARD_ADMIN') body.wardId = effectiveWardId;
      if (role === 'POLLING_UNIT_OFFICER') body.pollingUnitId = effectivePollingUnitId;
      if (role === 'DATA_ENTRY_OFFICER') {
        // Most-specific-first, matching the backend's own precedence.
        if (effectivePollingUnitId) body.pollingUnitId = effectivePollingUnitId;
        else if (effectiveWardId) body.wardId = effectiveWardId;
        else if (effectiveLgaId) body.lgaId = effectiveLgaId;
        else if (effectiveDistrictId) body.senatorialDistrictId = effectiveDistrictId;
      }
      if (role === 'POLLING_UNIT_OFFICER' && actor?.role === 'SUPER_ADMIN') {
        body.canCreateUsers = grantCreateUsers;
      }

      await api.post('/users', body);
      showToast('User created.', 'success');
      setEmail('');
      setPassword('');
      setFullName('');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create user.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(u: AdminUser) {
    try {
      await api.patch(`/users/${u.id}`, { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update user.', 'error');
    }
  }

  async function toggleCreatePermission(u: AdminUser) {
    try {
      await api.patch(`/users/${u.id}`, { canCreateUsers: !u.canCreateUsers });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast(
        u.canCreateUsers ? 'User-creation permission revoked.' : 'User-creation permission granted.',
        'success',
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update user.', 'error');
    }
  }

  return (
    <>
      <Topbar title="Users & Roles" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Users & Roles" description="Manage administrator accounts and their organizational scope." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TableContainer>
            <THead>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Scope</Th>
              <Th>Status</Th>
              <Th>Created By</Th>
              <Th>Last Login</Th>
              <Th />
            </THead>
            <TBody>
              {users?.items.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title="No users in your scope" description="Accounts you manage will appear here." />
                  </td>
                </tr>
              )}
              {users?.items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/users/${u.id}`} className="flex items-center gap-3">
                      <Avatar name={u.fullName} size="sm" />
                      <div>
                        <p className="font-medium text-slate-800">{u.fullName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    {u.role.replaceAll('_', ' ')}
                    {u.role === 'POLLING_UNIT_OFFICER' && u.canCreateUsers && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                        can create users
                      </span>
                    )}
                  </Td>
                  <Td className="text-slate-600">{scopeLabel(u)}</Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td className="text-slate-600">{u.createdBy?.fullName ?? '—'}</Td>
                  <Td className="text-slate-600">{formatDateTime(u.lastLoginAt)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {actor?.role === 'SUPER_ADMIN' && u.role === 'POLLING_UNIT_OFFICER' && (
                        <Button variant="ghost" size="sm" onClick={() => toggleCreatePermission(u)}>
                          {u.canCreateUsers ? 'Revoke creation' : 'Grant creation'}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(u)}>
                        {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      </Button>
                      <Link href={`/users/${u.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </TBody>
          </TableContainer>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create User</CardTitle>
          </CardHeader>
          <CardContent>
            {roles.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <ShieldAlert className="h-6 w-6 text-slate-300" aria-hidden="true" />
                <p className="text-sm text-slate-500">
                  Your account isn&apos;t authorized to create other users.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <Label>Full Name</Label>
                  <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label>Temporary Password</Label>
                  <Input
                    required
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </Select>
                </div>

                {showDistrictSelect && (
                  <div>
                    <Label>Senatorial District</Label>
                    <Select
                      required
                      value={senatorialDistrictId}
                      onChange={(e) => setSenatorialDistrictId(e.target.value)}
                    >
                      <option value="">Select District</option>
                      {districts?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {showLgaSelect && (
                  <div>
                    <Label>LGA{role === 'DATA_ENTRY_OFFICER' ? ' (optional)' : ''}</Label>
                    <Select
                      required={role !== 'DATA_ENTRY_OFFICER'}
                      value={lgaId}
                      onChange={(e) => {
                        setLgaId(e.target.value);
                        setWardId('');
                        setPollingUnitId('');
                      }}
                    >
                      <option value="">Select LGA</option>
                      {lgas?.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {showWardSelect && (
                  <div>
                    <Label>Ward{role === 'DATA_ENTRY_OFFICER' ? ' (optional)' : ''}</Label>
                    <Select
                      required={role !== 'DATA_ENTRY_OFFICER'}
                      disabled={!effectiveLgaId}
                      value={wardId}
                      onChange={(e) => {
                        setWardId(e.target.value);
                        setPollingUnitId('');
                      }}
                    >
                      <option value="">Select Ward</option>
                      {wards?.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {showPollingUnitSelect && (
                  <div>
                    <Label>Polling Unit{role === 'DATA_ENTRY_OFFICER' ? ' (optional)' : ''}</Label>
                    <Select
                      required={role !== 'DATA_ENTRY_OFFICER'}
                      disabled={!effectiveWardId}
                      value={pollingUnitId}
                      onChange={(e) => setPollingUnitId(e.target.value)}
                    >
                      <option value="">Select Polling Unit</option>
                      {pollingUnits?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {role === 'POLLING_UNIT_OFFICER' && actor?.role === 'SUPER_ADMIN' && (
                  <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={grantCreateUsers}
                      onChange={(e) => setGrantCreateUsers(e.target.checked)}
                    />
                    <span>
                      Allow this Polling Unit Officer to create Data Entry Officer accounts in their own unit.
                    </span>
                  </label>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Creating…' : 'Create User'}
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
