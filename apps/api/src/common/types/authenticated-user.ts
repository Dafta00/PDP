import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  senatorialDistrictId: string | null;
  lgaId: string | null;
  wardId: string | null;
  pollingUnitId: string | null;
  /**
   * POLLING_UNIT_OFFICER-only: SUPER_ADMIN-granted permission to create
   * DATA_ENTRY_OFFICER accounts. Meaningless for every other role. Optional
   * (like `fullName` below) so existing test fixtures that build a minimal
   * actor still type-check; treat missing as `false`.
   */
  canCreateUsers?: boolean;
  /**
   * Additional geographic units (beyond the single primary scope fields
   * above) this user has been explicitly granted, via UserScope rows —
   * always SUPER_ADMIN-granted. Optional/defaults to none so existing test
   * fixtures still type-check. OrgScopeService and AuthorizationService are
   * the only things that should read this.
   */
  additionalScopes?: {
    senatorialDistrictId?: string | null;
    lgaId?: string | null;
    wardId?: string | null;
    pollingUnitId?: string | null;
  }[];
  /** Optional so existing test fixtures that build a minimal actor still type-check. */
  fullName?: string;
}
