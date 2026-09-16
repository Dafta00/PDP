'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth, UNRESTRICTED_ROLES } from '@/lib/auth-context';
import { MemberListItem, MemberStatus, OrgUnit, PaginatedResult } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';

const STATUS_OPTIONS: (MemberStatus | 'ALL')[] = ['ALL', 'PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'];
const PAGE_SIZE = 20;

export default function MembersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MemberStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [districtId, setDistrictId] = useState(searchParams.get('senatorialDistrictId') ?? '');
  const [lgaId, setLgaId] = useState(searchParams.get('lgaId') ?? '');
  const [wardId, setWardId] = useState(searchParams.get('wardId') ?? '');
  const [pollingUnitId, setPollingUnitId] = useState(searchParams.get('pollingUnitId') ?? '');

  // A SUPER_ADMIN/STATE_ADMIN gets the full drill-down; everyone else only
  // gets filters for levels *below* their own scope — their own scope is
  // already the ceiling, enforced by the backend regardless of what's shown.
  const isUnrestricted = user ? UNRESTRICTED_ROLES.includes(user.role) : false;
  const showDistrictFilter = isUnrestricted;
  const showLgaFilter = isUnrestricted || user?.role === 'SENATORIAL_ADMIN';
  const showWardFilter = showLgaFilter || user?.role === 'LGA_ADMIN';
  const showPollingUnitFilter = showWardFilter || user?.role === 'WARD_ADMIN';
  const showDistrictColumn = isUnrestricted || user?.role === 'SENATORIAL_ADMIN';

  const { data: districts } = useQuery({
    queryKey: ['senatorial-districts'],
    queryFn: () => api.get<OrgUnit[]>('/organization/senatorial-districts'),
    enabled: showDistrictFilter,
  });
  const { data: lgas } = useQuery({
    queryKey: ['lgas', districtId],
    queryFn: () =>
      api.get<OrgUnit[]>(
        districtId ? `/organization/lgas?senatorialDistrictId=${districtId}` : '/organization/lgas',
      ),
    enabled: showLgaFilter,
  });
  const { data: wards } = useQuery({
    queryKey: ['wards', lgaId],
    queryFn: () => api.get<OrgUnit[]>(`/organization/wards?lgaId=${lgaId}`),
    enabled: showWardFilter && !!lgaId,
  });
  const { data: pollingUnits } = useQuery({
    queryKey: ['polling-units', wardId],
    queryFn: () => api.get<OrgUnit[]>(`/organization/polling-units?wardId=${wardId}`),
    enabled: showPollingUnitFilter && !!wardId,
  });

  // Keep the URL reflecting the active geographic filter so a dashboard
  // district tile, an Organization-page drill-down link, or a
  // bookmarked/shared link all land on the right, pre-filtered view.
  useEffect(() => {
    const params = new URLSearchParams();
    if (districtId) params.set('senatorialDistrictId', districtId);
    if (lgaId) params.set('lgaId', lgaId);
    if (wardId) params.set('wardId', wardId);
    if (pollingUnitId) params.set('pollingUnitId', pollingUnitId);
    router.replace(`/members${params.toString() ? `?${params}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtId, lgaId, wardId, pollingUnitId]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['members', search, status, page, districtId, lgaId, wardId, pollingUnitId],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (status !== 'ALL') params.set('status', status);
      if (districtId) params.set('senatorialDistrictId', districtId);
      if (lgaId) params.set('lgaId', lgaId);
      if (wardId) params.set('wardId', wardId);
      if (pollingUnitId) params.set('pollingUnitId', pollingUnitId);
      return api.get<PaginatedResult<MemberListItem>>(`/members?${params.toString()}`);
    },
  });

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;

  return (
    <>
      <Topbar title="Members" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Members"
          description="Search, filter, and manage registered members across Gombe State."
          actions={
            <Link href="/members/new">
              <Button>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Register Member
              </Button>
            </Link>
          }
        />

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            icon={Search}
            placeholder="Search by name, phone, or membership ID"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="sm:max-w-xs"
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as MemberStatus | 'ALL');
              setPage(1);
            }}
            className="sm:max-w-[160px]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : s}
              </option>
            ))}
          </Select>

          {showDistrictFilter && (
            <Select
              value={districtId}
              onChange={(e) => {
                setDistrictId(e.target.value);
                setLgaId('');
                setWardId('');
                setPollingUnitId('');
                setPage(1);
              }}
              className="sm:max-w-[170px]"
            >
              <option value="">All districts</option>
              {districts?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}

          {showLgaFilter && (
            <Select
              value={lgaId}
              onChange={(e) => {
                setLgaId(e.target.value);
                setWardId('');
                setPollingUnitId('');
                setPage(1);
              }}
              className="sm:max-w-[150px]"
            >
              <option value="">All LGAs</option>
              {lgas?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}

          {showWardFilter && (
            <Select
              value={wardId}
              disabled={!lgaId}
              onChange={(e) => {
                setWardId(e.target.value);
                setPollingUnitId('');
                setPage(1);
              }}
              className="sm:max-w-[150px]"
            >
              <option value="">All wards</option>
              {wards?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}

          {showPollingUnitFilter && (
            <Select
              value={pollingUnitId}
              disabled={!wardId}
              onChange={(e) => {
                setPollingUnitId(e.target.value);
                setPage(1);
              }}
              className="sm:max-w-[170px]"
            >
              <option value="">All polling units</option>
              {pollingUnits?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <TableContainer>
          <THead>
            <Th>Member</Th>
            <Th>Membership ID</Th>
            <Th>Phone</Th>
            {showDistrictColumn && <Th>District</Th>}
            <Th>LGA / Ward</Th>
            <Th>Status</Th>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={showDistrictColumn ? 6 : 5} />}
            {error && (
              <tr>
                <td colSpan={showDistrictColumn ? 6 : 5}>
                  <ErrorState description="Unable to load members." onRetry={() => refetch()} />
                </td>
              </tr>
            )}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={showDistrictColumn ? 6 : 5}>
                  <EmptyState
                    icon={Users}
                    title="No members found"
                    description="Try adjusting your search or filters, or register a new member."
                  />
                </td>
              </tr>
            )}
            {data?.items.map((m) => {
              const fullName = [m.firstName, m.middleName, m.surname].filter(Boolean).join(' ');
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/members/${m.id}`} className="flex items-center gap-3">
                      <Avatar name={fullName} photoUrl={m.photoUrl} size="sm" />
                      <span className="font-medium text-slate-800">{fullName}</span>
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/members/${m.id}`} className="font-medium text-brand-700 hover:underline">
                      {m.membershipId}
                    </Link>
                  </Td>
                  <Td>{m.phone}</Td>
                  {showDistrictColumn && <Td>{m.lga.senatorialDistrict?.name ?? '—'}</Td>}
                  <Td>
                    {m.lga.name} / {m.ward.name}
                  </Td>
                  <Td>
                    <StatusBadge status={m.status} />
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </TableContainer>

        {data && data.total > 0 && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of{' '}
              {data.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
