export interface MembershipReport {
  total: number;
  byStatus: { status: string; count: number }[];
  byLga: { lgaId: string; name: string; total: number }[];
  byWard: { wardId: string; name: string; lgaId: string; total: number }[];
  registrationTrend: { month: string; count: number }[];
}

export interface ActivityReport {
  totalEvents: number;
  eventsByStatus: { status: string; count: number }[];
  totalAttendance: number;
  topEvents: {
    id: string;
    title: string;
    status: string;
    startTime: string;
    attendanceCount: number;
  }[];
}

export interface ResourceReport {
  resources: {
    id: string;
    name: string;
    unit: string | null;
    totalQuantity: number;
    allocatedQuantity: number;
    remainingQuantity: number;
  }[];
  allocationsByLga: { lgaId: string; name: string; totalAllocated: number; totalRemaining: number }[];
  totalUsage: number;
}

export interface DistributionReport {
  distributions: {
    id: string;
    title: string;
    status: string;
    resourceName: string;
    unit: string | null;
    totalAllocated: number;
    totalDistributed: number;
    totalRemaining: number;
    recipientCount: number;
  }[];
  receiptsByLga: { lgaId: string; name: string; count: number }[];
}
