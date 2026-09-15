import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../types/authenticated-user';

const UNRESTRICTED_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.DATA_ENTRY_OFFICER,
];

const DISTRICT_WIDE: Prisma.EventWhereInput = {
  targetLgaId: null,
  targetWardId: null,
  targetPollingUnitId: null,
};

/**
 * Central place that turns a user's role + assigned organizational unit into
 * a Prisma filter / access check. Reused by every module that scopes data by
 * LGA/Ward/Polling Unit (members today; events, distributions, etc. later).
 */
@Injectable()
export class OrgScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Prisma `where` fragment restricting records to what this user may see. */
  memberScopeWhere(user: AuthenticatedUser): Prisma.MemberWhereInput {
    if (UNRESTRICTED_ROLES.includes(user.role)) {
      return {};
    }
    if (user.role === Role.LGA_ADMIN && user.lgaId) {
      return { lgaId: user.lgaId };
    }
    if (user.role === Role.WARD_ADMIN && user.wardId) {
      return { wardId: user.wardId };
    }
    if (user.role === Role.POLLING_UNIT_OFFICER && user.pollingUnitId) {
      return { pollingUnitId: user.pollingUnitId };
    }
    // A scoped role with no assigned unit sees nothing rather than everything.
    return { id: '__no_access__' };
  }

  /** Throws unless the user is permitted to act on the given organizational unit. */
  assertCanAccessOrgUnit(
    user: AuthenticatedUser,
    target: { lgaId?: string | null; wardId?: string | null; pollingUnitId?: string | null },
  ): void {
    if (UNRESTRICTED_ROLES.includes(user.role)) return;

    if (user.role === Role.LGA_ADMIN) {
      if (user.lgaId && target.lgaId === user.lgaId) return;
    } else if (user.role === Role.WARD_ADMIN) {
      if (user.wardId && target.wardId === user.wardId) return;
    } else if (user.role === Role.POLLING_UNIT_OFFICER) {
      if (user.pollingUnitId && target.pollingUnitId === user.pollingUnitId) return;
    }

    throw new ForbiddenException('This record is outside your assigned organizational scope.');
  }

  /**
   * Events denormalize their target ancestor chain (like Member does), but
   * scoped roles also need to see broader events above their own unit
   * (e.g. a ward officer should see an LGA-wide meeting) — that requires
   * resolving their unit's ancestors, hence the DB lookups here.
   */
  async eventScopeWhere(user: AuthenticatedUser): Promise<Prisma.EventWhereInput> {
    if (UNRESTRICTED_ROLES.includes(user.role)) {
      return {};
    }

    if (user.role === Role.LGA_ADMIN && user.lgaId) {
      return { OR: [DISTRICT_WIDE, { targetLgaId: user.lgaId }] };
    }

    if (user.role === Role.WARD_ADMIN && user.wardId) {
      const ward = await this.prisma.ward.findUnique({
        where: { id: user.wardId },
        select: { lgaId: true },
      });
      return {
        OR: [
          DISTRICT_WIDE,
          ...(ward ? [{ targetLgaId: ward.lgaId, targetWardId: null }] : []),
          { targetWardId: user.wardId },
        ],
      };
    }

    if (user.role === Role.POLLING_UNIT_OFFICER && user.pollingUnitId) {
      const pollingUnit = await this.prisma.pollingUnit.findUnique({
        where: { id: user.pollingUnitId },
        select: { wardId: true, ward: { select: { lgaId: true } } },
      });
      return {
        OR: [
          DISTRICT_WIDE,
          ...(pollingUnit
            ? [
                { targetLgaId: pollingUnit.ward.lgaId, targetWardId: null },
                { targetWardId: pollingUnit.wardId, targetPollingUnitId: null },
              ]
            : []),
          { targetPollingUnitId: user.pollingUnitId },
        ],
      };
    }

    return { id: '__no_access__' };
  }

  /** Single-record equivalent of `eventScopeWhere`, for direct-fetch-by-id checks. */
  async assertCanViewEvent(
    user: AuthenticatedUser,
    event: { targetLgaId: string | null; targetWardId: string | null; targetPollingUnitId: string | null },
  ): Promise<void> {
    if (UNRESTRICTED_ROLES.includes(user.role)) return;
    if (!event.targetLgaId) return; // district-wide

    if (user.role === Role.LGA_ADMIN && user.lgaId === event.targetLgaId) return;

    if (user.role === Role.WARD_ADMIN && user.wardId) {
      if (user.wardId === event.targetWardId) return;
      const ward = await this.prisma.ward.findUnique({ where: { id: user.wardId }, select: { lgaId: true } });
      if (ward && !event.targetWardId && ward.lgaId === event.targetLgaId) return;
    }

    if (user.role === Role.POLLING_UNIT_OFFICER && user.pollingUnitId) {
      if (user.pollingUnitId === event.targetPollingUnitId) return;
      const pollingUnit = await this.prisma.pollingUnit.findUnique({
        where: { id: user.pollingUnitId },
        select: { wardId: true, ward: { select: { lgaId: true } } },
      });
      if (pollingUnit) {
        if (!event.targetPollingUnitId && pollingUnit.wardId === event.targetWardId) return;
        if (!event.targetWardId && pollingUnit.ward.lgaId === event.targetLgaId) return;
      }
    }

    throw new ForbiddenException('This event is outside your assigned organizational scope.');
  }

  /**
   * Resource allocations always target a concrete unit (no district-wide
   * case), and — unlike events — a scoped role only needs to see allocations
   * at or within its own unit, not broader ones above it. So this is a
   * plain equality filter, no ancestor resolution required.
   */
  resourceAllocationScopeWhere(user: AuthenticatedUser): Prisma.ResourceAllocationWhereInput {
    if (UNRESTRICTED_ROLES.includes(user.role)) return {};
    if (user.role === Role.LGA_ADMIN && user.lgaId) return { targetLgaId: user.lgaId };
    if (user.role === Role.WARD_ADMIN && user.wardId) return { targetWardId: user.wardId };
    if (user.role === Role.POLLING_UNIT_OFFICER && user.pollingUnitId) {
      return { targetPollingUnitId: user.pollingUnitId };
    }
    return { id: '__no_access__' };
  }

  /**
   * Which LGAs/Wards an actor's own assignment falls within — used by
   * reports to decide which breakdown rows to even show. Distinct from
   * `assertCanAccessOrgUnit`'s exact-match semantics: a WARD_ADMIN's ward
   * doesn't literally equal an LGA id, so answering "which LGA am I in"
   * needs the same ancestor lookup `eventScopeWhere` does.
   */
  async resolveVisibleUnits(
    user: AuthenticatedUser,
  ): Promise<{ lgaIds: 'ALL' | string[]; wardIds: 'ALL' | string[] }> {
    if (UNRESTRICTED_ROLES.includes(user.role)) {
      return { lgaIds: 'ALL', wardIds: 'ALL' };
    }

    if (user.role === Role.LGA_ADMIN && user.lgaId) {
      const wards = await this.prisma.ward.findMany({
        where: { lgaId: user.lgaId },
        select: { id: true },
      });
      return { lgaIds: [user.lgaId], wardIds: wards.map((w) => w.id) };
    }

    if (user.role === Role.WARD_ADMIN && user.wardId) {
      const ward = await this.prisma.ward.findUnique({
        where: { id: user.wardId },
        select: { lgaId: true },
      });
      return { lgaIds: ward ? [ward.lgaId] : [], wardIds: [user.wardId] };
    }

    if (user.role === Role.POLLING_UNIT_OFFICER && user.pollingUnitId) {
      const pollingUnit = await this.prisma.pollingUnit.findUnique({
        where: { id: user.pollingUnitId },
        select: { wardId: true, ward: { select: { lgaId: true } } },
      });
      return {
        lgaIds: pollingUnit ? [pollingUnit.ward.lgaId] : [],
        wardIds: pollingUnit ? [pollingUnit.wardId] : [],
      };
    }

    return { lgaIds: [], wardIds: [] };
  }
}
