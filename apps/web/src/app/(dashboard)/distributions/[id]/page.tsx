'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Undo2, Users as UsersIcon } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { DistributionItem, DistributionReceiptItem, DistributionStatus } from '@/lib/distribution-types';
import { ResourceAllocationItem, AllocationTargetLevel } from '@/lib/resource-types';
import { OrgUnit } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { ReceiptConfirm } from '@/components/distributions/receipt-confirm';

const CAN_MANAGE = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN'];
const CAN_ALLOCATE = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN', 'LGA_ADMIN', 'WARD_ADMIN'];
const CAN_REVERSE = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN', 'LGA_ADMIN', 'WARD_ADMIN'];
const STATUS_OPTIONS: DistributionStatus[] = ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

const LEVELS_BY_ROLE: Record<string, AllocationTargetLevel[]> = {
  SUPER_ADMIN: ['LGA', 'WARD', 'POLLING_UNIT'],
  STATE_ADMIN: ['LGA', 'WARD', 'POLLING_UNIT'],
  SENATORIAL_ADMIN: ['LGA', 'WARD', 'POLLING_UNIT'],
  LGA_ADMIN: ['LGA', 'WARD', 'POLLING_UNIT'],
  WARD_ADMIN: ['WARD', 'POLLING_UNIT'],
};

function targetLabel(a: ResourceAllocationItem): string {
  if (a.targetPollingUnit) return `${a.targetLga.name} / ${a.targetWard?.name} / ${a.targetPollingUnit.name}`;
  if (a.targetWard) return `${a.targetLga.name} / ${a.targetWard.name}`;
  return a.targetLga.name;
}

export default function DistributionDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [statusUpdating, setStatusUpdating] = useState(false);

  // allocation form state
  const availableLevels = LEVELS_BY_ROLE[user?.role ?? ''] ?? ['WARD', 'POLLING_UNIT'];
  const [quantity, setQuantity] = useState('');
  const [targetLevel, setTargetLevel] = useState<AllocationTargetLevel>(availableLevels[0]);
  const [lgaId, setLgaId] = useState('');
  const [wardId, setWardId] = useState('');
  const [pollingUnitId, setPollingUnitId] = useState('');
  const [lgas, setLgas] = useState<OrgUnit[]>([]);
  const [wards, setWards] = useState<OrgUnit[]>([]);
  const [pollingUnits, setPollingUnits] = useState<OrgUnit[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reverseTarget, setReverseTarget] = useState<string | null>(null);

  const { data: distribution, isLoading, error: loadError } = useQuery({
    queryKey: ['distribution', params.id],
    queryFn: () => api.get<DistributionItem>(`/distributions/${params.id}`),
  });

  const { data: allocations, refetch: refetchAllocations } = useQuery({
    queryKey: ['distribution-allocations', params.id],
    queryFn: () => api.get<ResourceAllocationItem[]>(`/distributions/${params.id}/allocations`),
    enabled: !!distribution,
  });

  const { data: receipts, refetch: refetchReceipts } = useQuery({
    queryKey: ['distribution-receipts', params.id],
    queryFn: () => api.get<DistributionReceiptItem[]>(`/distributions/${params.id}/receipts`),
    enabled: !!distribution,
  });

  useEffect(() => {
    api.get<OrgUnit[]>('/organization/lgas').then(setLgas).catch(() => setLgas([]));
  }, []);

  useEffect(() => {
    setWards([]);
    setWardId('');
    setPollingUnitId('');
    if (!lgaId) return;
    api.get<OrgUnit[]>(`/organization/wards?lgaId=${lgaId}`).then(setWards).catch(() => setWards([]));
  }, [lgaId]);

  useEffect(() => {
    setPollingUnits([]);
    setPollingUnitId('');
    if (!wardId) return;
    api
      .get<OrgUnit[]>(`/organization/polling-units?wardId=${wardId}`)
      .then(setPollingUnits)
      .catch(() => setPollingUnits([]));
  }, [wardId]);

  const targetId = targetLevel === 'LGA' ? lgaId : targetLevel === 'WARD' ? wardId : pollingUnitId;

  async function changeStatus(status: DistributionStatus) {
    setStatusUpdating(true);
    try {
      await api.patch(`/distributions/${params.id}/status`, { status });
      showToast(`Distribution marked ${status.toLowerCase()}.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['distribution', params.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update status.', 'error');
    } finally {
      setStatusUpdating(false);
    }
  }

  async function createAllocation(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0 || !targetId) return;
    setSubmitting(true);
    try {
      await api.post(`/distributions/${params.id}/allocations`, { quantity: qty, targetLevel, targetId });
      showToast('Allocation created.', 'success');
      setQuantity('');
      refetchAllocations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create allocation.');
    } finally {
      setSubmitting(false);
    }
  }

  async function reverseReceipt(receiptId: string) {
    try {
      await api.post(`/distributions/${params.id}/receipts/${receiptId}/reverse`);
      showToast('Receipt reversed.', 'success');
      refetchReceipts();
      refetchAllocations();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to reverse receipt.', 'error');
    } finally {
      setReverseTarget(null);
    }
  }

  if (isLoading) {
    return (
      <>
        <Topbar title="Distribution" />
        <LoadingState label="Loading distribution…" />
      </>
    );
  }

  if (loadError || !distribution) {
    return (
      <>
        <Topbar title="Distribution" />
        <ErrorState title="Distribution not found" />
      </>
    );
  }

  return (
    <>
      <Topbar title={distribution.title} />
      <ConfirmDialog
        open={!!reverseTarget}
        title="Reverse this receipt?"
        description="This restores the item to the allocation's remaining stock and marks the receipt reversed. The member can be re-confirmed later if needed."
        confirmLabel="Reverse Receipt"
        onConfirm={() => reverseTarget && reverseReceipt(reverseTarget)}
        onCancel={() => setReverseTarget(null)}
      />
      <div className="p-4 sm:p-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Distributions', href: '/distributions' },
            { label: distribution.title },
          ]}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {distribution.resource.name} {distribution.resource.unit && `(${distribution.resource.unit})`}
              </CardTitle>
              <StatusBadge status={distribution.status} />
            </CardHeader>
            <CardContent>
              {distribution.description && <p className="text-sm text-slate-600">{distribution.description}</p>}
              <p className="mt-2 text-xs text-slate-400">Organized by {distribution.organizer.fullName}</p>

              {user && CAN_MANAGE.includes(user.role) && (
                <div className="mt-4">
                  <Select
                    disabled={statusUpdating}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) changeStatus(e.target.value as DistributionStatus);
                    }}
                    className="max-w-xs"
                  >
                    <option value="">Change status…</option>
                    {STATUS_OPTIONS.filter((s) => s !== distribution.status).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Allocations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TableContainer className="rounded-none border-0">
                <THead>
                  <Th>Target</Th>
                  <Th>Allocated</Th>
                  <Th>Remaining</Th>
                </THead>
                <TBody>
                  {allocations?.length === 0 && (
                    <tr>
                      <td colSpan={3}>
                        <EmptyState icon={ArrowLeftRight} title="No allocations yet" />
                      </td>
                    </tr>
                  )}
                  {allocations?.map((a) => (
                    <tr key={a.id}>
                      <Td>{targetLabel(a)}</Td>
                      <Td>
                        {a.quantity} {a.resource.unit}
                      </Td>
                      <Td>
                        {a.remainingQuantity} {a.resource.unit}
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </TableContainer>

              {user && CAN_ALLOCATE.includes(user.role) && (
                <form onSubmit={createAllocation} className="space-y-3 border-t border-slate-100 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">New Allocation</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Input
                      type="number"
                      min={1}
                      placeholder="Quantity"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                    <Select
                      value={targetLevel}
                      onChange={(e) => setTargetLevel(e.target.value as AllocationTargetLevel)}
                    >
                      {availableLevels.map((l) => (
                        <option key={l} value={l}>
                          {l.replace('_', ' ')}
                        </option>
                      ))}
                    </Select>
                    <Select value={lgaId} onChange={(e) => setLgaId(e.target.value)}>
                      <option value="">LGA</option>
                      {lgas.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                    {(targetLevel === 'WARD' || targetLevel === 'POLLING_UNIT') && (
                      <Select disabled={!lgaId} value={wardId} onChange={(e) => setWardId(e.target.value)}>
                        <option value="">Ward</option>
                        {wards.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </Select>
                    )}
                    {targetLevel === 'POLLING_UNIT' && (
                      <Select
                        disabled={!wardId}
                        value={pollingUnitId}
                        onChange={(e) => setPollingUnitId(e.target.value)}
                      >
                        <option value="">Polling Unit</option>
                        {pollingUnits.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? 'Allocating…' : 'Allocate'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receipts ({receipts?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TableContainer className="rounded-none border-0">
                <THead>
                  <Th>Member</Th>
                  <Th>Location</Th>
                  <Th>Status</Th>
                  <Th>Officer</Th>
                  <Th />
                </THead>
                <TBody>
                  {receipts?.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState icon={UsersIcon} title="No receipts yet" />
                      </td>
                    </tr>
                  )}
                  {receipts?.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        {[r.member.firstName, r.member.middleName, r.member.surname].filter(Boolean).join(' ')}{' '}
                        <span className="text-xs text-slate-400">({r.member.membershipId})</span>
                      </Td>
                      <Td>
                        {r.allocation.targetPollingUnit?.name ??
                          r.allocation.targetWard?.name ??
                          r.allocation.targetLga.name}
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                      <Td>{r.officer.fullName}</Td>
                      <Td className="text-right">
                        {user && CAN_REVERSE.includes(user.role) && r.status === 'CONFIRMED' && (
                          <Button variant="ghost" size="sm" onClick={() => setReverseTarget(r.id)}>
                            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Reverse
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </TableContainer>
            </CardContent>
          </Card>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-slate-800">Confirm Receipt</p>
          {distribution.status === 'ACTIVE' ? (
            <ReceiptConfirm
              distributionId={distribution.id}
              onConfirmed={() => {
                refetchReceipts();
                refetchAllocations();
              }}
            />
          ) : (
            <p className="flex items-start gap-2 rounded-md bg-warning-50 p-3 text-sm text-warning-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Receipts can only be confirmed while this distribution is Active. It is currently{' '}
              {distribution.status}.
            </p>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
