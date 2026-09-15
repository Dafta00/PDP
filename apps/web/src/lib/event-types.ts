export type EventStatus = 'DRAFT' | 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type EventTargetLevel = 'DISTRICT' | 'LGA' | 'WARD' | 'POLLING_UNIT';

export interface EventListItem {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string;
  status: EventStatus;
  organizer: { id: string; fullName: string };
  targetLga: { id: string; name: string } | null;
  targetWard: { id: string; name: string } | null;
  targetPollingUnit: { id: string; name: string } | null;
  _count: { attendances: number };
}

export interface AttendanceRecord {
  id: string;
  method: 'QR' | 'MEMBERSHIP_ID' | 'SEARCH';
  checkedInAt: string;
  member: {
    id: string;
    membershipId: string;
    firstName: string;
    middleName: string | null;
    surname: string;
  };
  recordedBy: { id: string; fullName: string } | null;
}
