import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  lgaId: string | null;
  wardId: string | null;
  pollingUnitId: string | null;
  /** Optional so existing test fixtures that build a minimal actor still type-check. */
  fullName?: string;
}
