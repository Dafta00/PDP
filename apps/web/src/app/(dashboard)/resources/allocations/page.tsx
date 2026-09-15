'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { ResourceAllocationItem, ResourceItem, AllocationTargetLevel } from '@/lib/resource-types';
import { OrgUnit } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, LoadingState } from '@/components/ui/states';

const CAN_ALLOCATE = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN', 'LGA_ADMIN', 'WARD_ADMIN'];

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

export default function AllocationsPage() {
  const { user } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const availableLevels = LEVELS_BY_ROLE[user?.role ?? ''] ?? ['WARD', 'POLLING_UNIT'];

  const [resourceId, setResourceId] = useState('');
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

  const { data: allocations, isLoading } = useQuery({
    queryKey: ['allocations'],
    queryFn: () => api.get<ResourceAllocationItem[]>('/resources/allocations/list'),
  });

  const { data: resources } = useQuery({
    queryKey: ['resources'],
    queryFn: () => api.get<ResourceItem[]>('/resources'),
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

  const targetId =
    targetLevel === 'LGA' ? lgaId : targetLevel === 'WARD' ? wardId : pollingUnitId;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = parseInt(quantity, 10);
    if (!resourceId || !qty || qty <= 0 || !targetId) return;
    setSubmitting(true);
    try {
      await api.post('/resources/allocations', {
        resourceId,
        quantity: qty,
        targetLevel,
        targetId,
      });
      showToast('Allocation created.', 'success');
      setQuantity('');
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create allocation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Resource Allocations" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Resource Allocations" description="Track how stock has been assigned to organizational units." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading && <LoadingState label="Loading allocations…" />}
          {allocations?.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No allocations yet" />
          ) : (
            <TableContainer>
              <THead>
                <Th>Resource</Th>
                <Th>Target</Th>
                <Th>Allocated</Th>
                <Th>Remaining</Th>
              </THead>
              <TBody>
                {allocations?.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/resources/allocations/${a.id}`} className="font-medium text-brand-700 hover:underline">
                        {a.resource.name}
                      </Link>
                    </Td>
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
          )}
        </div>

        {user && CAN_ALLOCATE.includes(user.role) && (
          <Card>
            <CardHeader>
              <CardTitle>New Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-3">
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
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Level</Label>
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
                </div>
                <div>
                  <Label>LGA</Label>
                  <Select required value={lgaId} onChange={(e) => setLgaId(e.target.value)}>
                    <option value="">Select LGA</option>
                    {lgas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {(targetLevel === 'WARD' || targetLevel === 'POLLING_UNIT') && (
                  <div>
                    <Label>Ward</Label>
                    <Select
                      required
                      disabled={!lgaId}
                      value={wardId}
                      onChange={(e) => setWardId(e.target.value)}
                    >
                      <option value="">Select Ward</option>
                      {wards.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {targetLevel === 'POLLING_UNIT' && (
                  <div>
                    <Label>Polling Unit</Label>
                    <Select
                      required
                      disabled={!wardId}
                      value={pollingUnitId}
                      onChange={(e) => setPollingUnitId(e.target.value)}
                    >
                      <option value="">Select Polling Unit</option>
                      {pollingUnits.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Allocating…' : 'Allocate'}
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
