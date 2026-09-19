export type MemberStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type Gender = 'MALE' | 'FEMALE';
export type EducationLevel =
  | 'NO_FORMAL_EDUCATION'
  | 'PRIMARY'
  | 'SECONDARY'
  | 'NCE'
  | 'ND'
  | 'HND'
  | 'BACHELORS_DEGREE'
  | 'POSTGRADUATE_DIPLOMA'
  | 'MASTERS_DEGREE'
  | 'PHD'
  | 'OTHER';

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
  educationLevel: EducationLevel | null;
  dateJoined: string;
  lga: OrgUnit & { senatorialDistrict?: OrgUnit };
  ward: OrgUnit;
  pollingUnit: OrgUnit;
}

export interface MemberDetail extends Omit<MemberListItem, 'lga' | 'ward' | 'pollingUnit'> {
  email: string | null;
  address: string | null;
  occupation: string | null;
  dateOfBirth: string;
  educationLevelOther: string | null;
  pvcNumber: string | null;
  // Present on every detail response — true when a NIN is on file, whether
  // or not the caller is authorized to see the actual value.
  hasNin: boolean;
  // Only ever present in the JSON payload for a SUPER_ADMIN caller; absent
  // (not null, not masked) for everyone else — the backend never sends a
  // placeholder value that could be mistaken for real data.
  nin?: string;
  lgaId: string;
  wardId: string;
  pollingUnitId: string;
  lga: OrgUnit & { id: string; senatorialDistrict?: OrgUnit };
  ward: OrgUnit & { id: string };
  pollingUnit: OrgUnit & { id: string };
  qrCode: { status: 'ACTIVE' | 'REVOKED' } | null;
  createdBy: { id: string; fullName: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
