export type ResourceTransactionType = 'USAGE' | 'ADJUSTMENT';
export type AllocationTargetLevel = 'LGA' | 'WARD' | 'POLLING_UNIT';

export interface ResourceItem {
  id: string;
  name: string;
  unit: string | null;
  description: string | null;
  totalQuantity: number;
  remainingQuantity: number;
  allocatedQuantity: number;
  createdAt: string;
}

export interface ResourceAllocationItem {
  id: string;
  quantity: number;
  remainingQuantity: number;
  notes: string | null;
  createdAt: string;
  resource: { id: string; name: string; unit: string | null };
  targetLga: { id: string; name: string };
  targetWard: { id: string; name: string } | null;
  targetPollingUnit: { id: string; name: string } | null;
  allocatedBy: { id: string; fullName: string };
}

export interface ResourceTransactionItem {
  id: string;
  type: ResourceTransactionType;
  quantity: number;
  notes: string | null;
  createdAt: string;
  recordedBy: { id: string; fullName: string } | null;
}
