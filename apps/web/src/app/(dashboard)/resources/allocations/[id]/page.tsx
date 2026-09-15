'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { ResourceAllocationItem, ResourceTransactionItem, ResourceTransactionType } from '@/lib/resource-types';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { History } from 'lucide-react';

function targetLabel(a: ResourceAllocationItem): string {
  if (a.targetPollingUnit) return `${a.targetLga.name} / ${a.targetWard?.name} / ${a.targetPollingUnit.name}`;
  if (a.targetWard) return `${a.targetLga.name} / ${a.targetWard.name}`;
  return a.targetLga.name;
}

export default function AllocationDetailPage() {
  const params = useParams<{ id: string }>();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [type, setType] = useState<ResourceTransactionType>('USAGE');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: allocation, isLoading, error: loadError } = useQuery({
    queryKey: ['allocation', params.id],
    queryFn: () => api.get<ResourceAllocationItem>(`/resources/allocations/${params.id}`),
  });

  const { data: transactions } = useQuery({
    queryKey: ['allocation-transactions', params.id],
    queryFn: () => api.get<ResourceTransactionItem[]>(`/resources/allocations/${params.id}/transactions`),
    enabled: !!allocation,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = parseInt(quantity, 10);
    if (!qty) return;
    setSubmitting(true);
    try {
      await api.post(`/resources/allocations/${params.id}/transactions`, { type, quantity: qty, notes: notes || undefined });
      showToast('Recorded.', 'success');
      setQuantity('');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['allocation', params.id] });
      queryClient.invalidateQueries({ queryKey: ['allocation-transactions', params.id] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to record this transaction.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <>
        <Topbar title="Allocation" />
        <LoadingState label="Loading allocation…" />
      </>
    );
  }

  if (loadError || !allocation) {
    return (
      <>
        <Topbar title="Allocation" />
        <ErrorState title="Allocation not found" />
      </>
    );
  }

  return (
    <>
      <Topbar title={`${allocation.resource.name} — ${targetLabel(allocation)}`} />
      <div className="p-4 sm:p-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Allocations', href: '/resources/allocations' },
            { label: allocation.resource.name },
          ]}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Allocated</p>
                  <p className="font-semibold text-slate-900">
                    {allocation.quantity} {allocation.resource.unit}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Remaining</p>
                  <p className="font-semibold text-slate-900">
                    {allocation.remainingQuantity} {allocation.resource.unit}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Used</p>
                  <p className="font-semibold text-slate-900">
                    {allocation.quantity - allocation.remainingQuantity} {allocation.resource.unit}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Allocated by {allocation.allocatedBy.fullName} on{' '}
                {new Date(allocation.createdAt).toLocaleDateString()}
                {allocation.notes && ` — ${allocation.notes}`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TableContainer className="rounded-none border-0">
                <THead>
                  <Th>Type</Th>
                  <Th>Quantity</Th>
                  <Th>Recorded By</Th>
                  <Th>Date</Th>
                </THead>
                <TBody>
                  {transactions?.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState icon={History} title="No transactions recorded yet" />
                      </td>
                    </tr>
                  )}
                  {transactions?.map((t) => (
                    <tr key={t.id}>
                      <Td>{t.type}</Td>
                      <Td>
                        {t.type === 'ADJUSTMENT' && t.quantity > 0 ? '+' : ''}
                        {t.quantity}
                      </Td>
                      <Td>{t.recordedBy?.fullName ?? '—'}</Td>
                      <Td className="text-slate-500">{new Date(t.createdAt).toLocaleString()}</Td>
                    </tr>
                  ))}
                </TBody>
              </TableContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Record Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <Label>Type</Label>
                <Select value={type} onChange={(e) => setType(e.target.value as ResourceTransactionType)}>
                  <option value="USAGE">Usage / Distributed</option>
                  <option value="ADJUSTMENT">Adjustment (correction)</option>
                </Select>
              </div>
              <div>
                <Label>Quantity {type === 'ADJUSTMENT' && '(use a negative number to reduce)'}</Label>
                <Input
                  type="number"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Recording…' : 'Record'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  );
}
