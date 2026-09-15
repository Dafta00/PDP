'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api-client';
import { MemberListItem, MemberStatus, PaginatedResult } from '@/lib/types';
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
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MemberStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['members', search, status, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (status !== 'ALL') params.set('status', status);
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
          description="Search, filter, and manage registered members across Gombe Central."
          actions={
            <Link href="/members/new">
              <Button>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Register Member
              </Button>
            </Link>
          }
        />

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
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
            className="sm:max-w-[180px]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : s}
              </option>
            ))}
          </Select>
        </div>

        <TableContainer>
          <THead>
            <Th>Member</Th>
            <Th>Membership ID</Th>
            <Th>Phone</Th>
            <Th>LGA / Ward</Th>
            <Th>Status</Th>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={5} />}
            {error && (
              <tr>
                <td colSpan={5}>
                  <ErrorState description="Unable to load members." onRetry={() => refetch()} />
                </td>
              </tr>
            )}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5}>
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
