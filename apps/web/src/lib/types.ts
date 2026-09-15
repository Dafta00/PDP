export type MemberStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type Gender = 'MALE' | 'FEMALE';

export interface OrgUnit {
  id: string;
  name: string;
}

export interface MemberListItem {
  id: string;
  membershipId: string;
  firstName: string;
  middleName: string | null;
  surname: string;
  gender: Gender;
  phone: string;
  status: MemberStatus;
  photoUrl: string | null;
  dateJoined: string;
  lga: OrgUnit;
  ward: OrgUnit;
  pollingUnit: OrgUnit;
}

export interface MemberDetail extends Omit<MemberListItem, 'lga' | 'ward' | 'pollingUnit'> {
  email: string | null;
  address: string | null;
  occupation: string | null;
  dateOfBirth: string;
  lgaId: string;
  wardId: string;
  pollingUnitId: string;
  lga: OrgUnit & { id: string };
  ward: OrgUnit & { id: string };
  pollingUnit: OrgUnit & { id: string };
  qrCode: { status: 'ACTIVE' | 'REVOKED' } | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
