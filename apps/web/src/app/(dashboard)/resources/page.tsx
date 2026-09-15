'use client';

import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { ResourceItem } from '@/lib/resource-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { EmptyState, LoadingState } from '@/components/ui/states';

const CAN_MANAGE = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN'];

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function RestockForm({ resourceId, unit }: { resourceId: string; unit: string | null }) {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) return;
    setSubmitting(true);
    try {
      await api.post(`/resources/${resourceId}/restock`, { quantity: qty });
      showToast('Stock added.', 'success');
      setQuantity('');
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to add stock.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        type="number"
        min={1}
        placeholder={`Quantity (${unit ?? 'units'})`}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="max-w-[160px]"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={submitting}>
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add Stock
      </Button>
    </form>
  );
}

export default function ResourcesPage() {
  const { user } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: resources, isLoading } = useQuery({
    queryKey: ['resources'],
    queryFn: () => api.get<ResourceItem[]>('/resources'),
  });

  async function createResource(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = parseInt(initialQuantity, 10);
    if (!name.trim() || isNaN(qty) || qty < 0) return;
    setSubmitting(true);
    try {
      await api.post('/resources', { name: name.trim(), unit: unit.trim() || undefined, initialQuantity: qty });
      showToast('Resource created.', 'success');
      setName('');
      setUnit('');
      setInitialQuantity('');
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create resource.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Resource Inventory" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Resource Inventory" description="Track stock levels for organizational resources." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {isLoading && <LoadingState label="Loading resources…" />}
          {resources?.length === 0 && (
            <EmptyState icon={Boxes} title="No resources yet" description="Add a resource to start tracking inventory." />
          )}
          {resources?.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-center gap-2">
                <Boxes className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <CardTitle>
                  {r.name} {r.unit && <span className="text-xs font-normal text-slate-400">({r.unit})</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Total</p>
                    <p className="font-semibold text-slate-900">{r.totalQuantity.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Allocated</p>
                    <p className="font-semibold text-slate-900">{r.allocatedQuantity.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Remaining (unallocated)</p>
                    <p className="font-semibold text-slate-900">{r.remainingQuantity.toLocaleString()}</p>
                  </div>
                </div>
                <ProgressBar value={r.allocatedQuantity} max={r.totalQuantity} />
                {user && CAN_MANAGE.includes(user.role) && (
                  <div className="mt-3">
                    <RestockForm resourceId={r.id} unit={r.unit} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {user && CAN_MANAGE.includes(user.role) && (
          <Card>
            <CardHeader>
              <CardTitle>Add Resource</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createResource} className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rice" />
                </div>
                <div>
                  <Label>Unit (optional)</Label>
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. bags" />
                </div>
                <div>
                  <Label>Initial Quantity</Label>
                  <Input
                    type="number"
                    min={0}
                    required
                    value={initialQuantity}
                    onChange={(e) => setInitialQuantity(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Creating…' : 'Add Resource'}
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
