'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { OrgUnit, PaginatedResult } from '@/lib/types';
import { Role } from '@/lib/auth-context';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  lgaId: string | null;
  wardId: string | null;
  pollingUnitId: string | null;
}

const ROLES: Role[] = [
  'SUPER_ADMIN',
  'STATE_ADMIN',
  'SENATORIAL_ADMIN',
  'LGA_ADMIN',
  'WARD_ADMIN',
  'POLLING_UNIT_OFFICER',
  'DATA_ENTRY_OFFICER',
];

const SCOPE_FIELD: Partial<Record<Role, 'lgaId' | 'wardId' | 'pollingUnitId'>> = {
  LGA_ADMIN: 'lgaId',
  WARD_ADMIN: 'wardId',
  POLLING_UNIT_OFFICER: 'pollingUnitId',
};

export default function UsersPage() {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('DATA_ENTRY_OFFICER');
  const [lgaId, setLgaId] = useState('');
  const [wardId, setWardId] = useState('');
  const [pollingUnitId, setPollingUnitId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<PaginatedResult<AdminUser>>('/users'),
  });

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

  useEffect(() => {
    setLgaId('');
    setWardId('');
    setPollingUnitId('');
  }, [role]);

  const scopeField = SCOPE_FIELD[role];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/users', {
        email,
        password,
        fullName,
        role,
        lgaId: scopeField === 'lgaId' ? lgaId : undefined,
        wardId: scopeField === 'wardId' ? wardId : undefined,
        pollingUnitId: scopeField === 'pollingUnitId' ? pollingUnitId : undefined,
      });
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

  return (
    <>
      <Topbar title="Users & Roles" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Users & Roles" description="Manage administrator accounts and their organizational scope." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TableContainer>
            <THead>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th />
            </THead>
            <TBody>
              {users?.items.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.fullName} size="sm" />
                      <div>
                        <p className="font-medium text-slate-800">{u.fullName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>{u.role.replaceAll('_', ' ')}</Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => toggleStatus(u)}>
                      {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                    </Button>
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
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.replaceAll('_', ' ')}
                    </option>
                  ))}
                </Select>
              </div>
              {scopeField === 'lgaId' && (
                <div>
                  <Label>LGA</Label>
                  <Select required value={lgaId} onChange={(e) => setLgaId(e.target.value)}>
                    <option value="">Select LGA</option>
                    {lgas?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {scopeField === 'wardId' && (
                <>
                  <div>
                    <Label>LGA</Label>
                    <Select value={lgaId} onChange={(e) => setLgaId(e.target.value)}>
                      <option value="">Select LGA</option>
                      {lgas?.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Ward</Label>
                    <Select
                      required
                      disabled={!lgaId}
                      value={wardId}
                      onChange={(e) => setWardId(e.target.value)}
                    >
                      <option value="">Select Ward</option>
                      {wards?.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </>
              )}
              {scopeField === 'pollingUnitId' && (
                <>
                  <div>
                    <Label>LGA</Label>
                    <Select value={lgaId} onChange={(e) => setLgaId(e.target.value)}>
                      <option value="">Select LGA</option>
                      {lgas?.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Ward</Label>
                    <Select
                      disabled={!lgaId}
                      value={wardId}
                      onChange={(e) => setWardId(e.target.value)}
                    >
                      <option value="">Select Ward</option>
                      {wards?.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Polling Unit</Label>
                    <Select
                      required
                      disabled={!wardId}
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
                </>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Creating…' : 'Create User'}
              </Button>
            </form>
          </CardContent>
        </Card>
        </div>
      </div>
    </>
  );
}
