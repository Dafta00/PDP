export type DistributionStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface DistributionItem {
  id: string;
  title: string;
  description: string | null;
  status: DistributionStatus;
  resource: { id: string; name: string; unit: string | null };
  organizer: { id: string; fullName: string };
  createdAt: string;
}

export interface DistributionReceiptItem {
  id: string;
  quantity: number;
  method: 'QR' | 'MEMBERSHIP_ID' | 'SEARCH';
  status: 'CONFIRMED' | 'REVERSED';
  createdAt: string;
  member: {
    id: string;
    membershipId: string;
    firstName: string;
    middleName: string | null;
    surname: string;
  };
  officer: { id: string; fullName: string };
  allocation: {
    targetLga: { name: string };
    targetWard: { name: string } | null;
    targetPollingUnit: { name: string } | null;
  };
}
