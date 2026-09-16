import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../types/authenticated-user';

// Only these two are genuinely state-wide/unrestricted. SENATORIAL_ADMIN and
// DATA_ENTRY_OFFICER used to be lumped in here, which meant a senatorial
// admin had no geographic restriction at all — a real gap, not a design
// choice. Fixed below: both are now scoped like every other role.
const UNRESTRICTED_ROLES: Role[] = [Role.SUPER_ADMIN, Role.STATE_ADMIN];

const NO_ACCESS = { id: '__no_access__' };

// An event/allocation with every target field null applies to the whole
// state (there is no narrower target at all) — distinct from a senatorial
// district, which is a real target level once an LGA lookup resolves it.
const STATE_WIDE: Prisma.EventWhereInput = {
  targetLgaId: null,
  targetWardId: null,
  targetPollingUnitId: null,
};

/**
 * A scoped role's effective assignment. Fixed-scope roles
 * (SENATORIAL_ADMIN/LGA_ADMIN/WARD_ADMIN/POLLING_UNIT_OFFICER) always
 * resolve to their one designated field. DATA_ENTRY_OFFICER is
 * "configurable" — it resolves to whichever single field is actually set on
 * the user, most specific first, so the same officer type can be deployed at
 * whatever level an admin assigns them to.
 */
type ResolvedScope =
  | { level: 'UNRESTRICTED' }
  | { level: 'SENATORIAL_DISTRICT'; id: string }
  | { level: 'LGA'; id: string }
  | { level: 'WARD'; id: string }
  | { level: 'POLLING_UNIT'; id: string }
  | { level: 'NONE' };

function resolveScope(user: AuthenticatedUser): ResolvedScope {
  if (UNRESTRICTED_ROLES.includes(user.role)) return { level: 'UNRESTRICTED' };

  if (user.role === Role.SENATORIAL_ADMIN) {
    return user.senatorialDistrictId
      ? { level: 'SENATORIAL_DISTRICT', id: user.senatorialDistrictId }
      : { level: 'NONE' };
  }
  if (user.role === Role.LGA_ADMIN) {
    return user.lgaId ? { level: 'LGA', id: user.lgaId } : { level: 'NONE' };
  }
  if (user.role === Role.WARD_ADMIN) {
    return user.wardId ? { level: 'WARD', id: user.wardId } : { level: 'NONE' };
  }
  if (user.role === Role.POLLING_UNIT_OFFICER) {
    return user.pollingUnitId ? { level: 'POLLING_UNIT', id: user.pollingUnitId } : { level: 'NONE' };
  }
  if (user.role === Role.DATA_ENTRY_OFFICER) {
    if (user.pollingUnitId) return { level: 'POLLING_UNIT', id: user.pollingUnitId };
    if (user.wardId) return { level: 'WARD', id: user.wardId };
    if (user.lgaId) return { level: 'LGA', id: user.lgaId };
    if (user.senatorialDistrictId) return { level: 'SENATORIAL_DISTRICT', id: user.senatorialDistrictId };
    return { level: 'NONE' }; // unconfigured data-entry officer sees nothing, not everything
  }
  return { level: 'NONE' };
}

/** Same most-specific-first interpretation as a single scope row, applied to each UserScope row. */
function resolveAdditionalScope(row: {
  senatorialDistrictId?: string | null;
  lgaId?: string | null;
  wardId?: string | null;
  pollingUnitId?: string | null;
}): ResolvedScope {
  if (row.pollingUnitId) return { level: 'POLLING_UNIT', id: row.pollingUnitId };
  if (row.wardId) return { level: 'WARD', id: row.wardId };
  if (row.lgaId) return { level: 'LGA', id: row.lgaId };
  if (row.senatorialDistrictId) return { level: 'SENATORIAL_DISTRICT', id: row.senatorialDistrictId };
  return { level: 'NONE' };
}

/**
 * Every unit this user is entitled to operate in: their one primary
 * role-scope, PLUS any additional units a SUPER_ADMIN has explicitly
 * granted via UserScope (see AuthorizationService.canAssignScope for who
 * may create those rows — never the user themselves, never a lower admin
 * widening their own reach). Everything below that consumes a scope OR's
 * across this list instead of assuming a single unit, so a multi-LGA
 * LGA_ADMIN genuinely sees/manages records in every LGA they've been
 * assigned, not just the first one.
 */
function resolveAllScopes(user: AuthenticatedUser): ResolvedScope[] {
  const primary = resolveScope(user);
  if (primary.level === 'UNRESTRICTED') return [primary];

  const additional = (user.additionalScopes ?? []).map(resolveAdditionalScope);
  const scopes = [primary, ...additional].filter((s): s is Exclude<ResolvedScope, { level: 'NONE' }> => s.level !== 'NONE');
  return scopes.length > 0 ? scopes : [{ level: 'NONE' }];
}

/**
 * Central place that turns a user's role + assigned organizational unit(s)
 * into a Prisma filter / access check. Reused by every module that scopes
 * data by senatorial district/LGA/Ward/Polling Unit.
 */
@Injectable()
export class OrgScopeService {
  constructor(private readonly prisma: PrismaService) {}

  private memberWhereForScope(scope: ResolvedScope): Prisma.MemberWhereInput {
    switch (scope.level) {
      case 'UNRESTRICTED':
        return {};
      case 'SENATORIAL_DISTRICT':
        return { lga: { senatorialDistrictId: scope.id } };
      case 'LGA':
        return { lgaId: scope.id };
      case 'WARD':
        return { wardId: scope.id };
      case 'POLLING_UNIT':
        return { pollingUnitId: scope.id };
      case 'NONE':
        return NO_ACCESS;
    }
  }

  /** Prisma `where` fragment restricting records to what this user may see, across every scope they hold. */
  memberScopeWhere(user: AuthenticatedUser): Prisma.MemberWhereInput {
    const scopes = resolveAllScopes(user);
    if (scopes.length === 1) return this.memberWhereForScope(scopes[0]);
    const clauses = scopes.map((s) => this.memberWhereForScope(s)).filter((c) => c !== NO_ACCESS);
    return clauses.length > 0 ? { OR: clauses } : NO_ACCESS;
  }

  private async orgUnitWithinScope(
    scope: ResolvedScope,
    target: { lgaId?: string | null; wardId?: string | null; pollingUnitId?: string | null },
  ): Promise<boolean> {
    if (scope.level === 'UNRESTRICTED') return true;
    if (scope.level === 'LGA') return target.lgaId === scope.id;
    if (scope.level === 'WARD') return target.wardId === scope.id;
    if (scope.level === 'POLLING_UNIT') return target.pollingUnitId === scope.id;
    if (scope.level === 'SENATORIAL_DISTRICT' && target.lgaId) {
      const lga = await this.prisma.lGA.findUnique({
        where: { id: target.lgaId },
        select: { senatorialDistrictId: true },
      });
      return lga?.senatorialDistrictId === scope.id;
    }
    return false;
  }

  /** Non-throwing form of `assertCanAccessOrgUnit`, for callers that want a boolean (e.g. AuthorizationService). */
  async canAccessOrgUnit(
    user: AuthenticatedUser,
    target: { lgaId?: string | null; wardId?: string | null; pollingUnitId?: string | null },
  ): Promise<boolean> {
    for (const scope of resolveAllScopes(user)) {
      if (await this.orgUnitWithinScope(scope, target)) return true;
    }
    return false;
  }

  /** Throws unless the user is permitted to act on the given organizational unit (in any scope they hold). */
  async assertCanAccessOrgUnit(
    user: AuthenticatedUser,
    target: { lgaId?: string | null; wardId?: string | null; pollingUnitId?: string | null },
  ): Promise<void> {
    if (await this.canAccessOrgUnit(user, target)) return;
    throw new ForbiddenException('This record is outside your assigned organizational scope.');
  }

  /**
   * Events denormalize their target ancestor chain (like Member does), but
   * scoped roles also need to see broader events above their own unit
   * (e.g. a ward officer should see an LGA-wide meeting) — that requires
   * resolving their unit's ancestors, hence the DB lookups here.
   *
   * Resolved against the user's PRIMARY scope only — a UserScope-granted
   * additional unit does not (yet) widen event visibility. Documented
   * limitation, not an oversight: extending this safely needs the same
   * ancestor-widening treatment per additional scope, which is a larger
   * change than the member/resource/org-unit checks above.
   */
  async eventScopeWhere(user: AuthenticatedUser): Promise<Prisma.EventWhereInput> {
    const scope = resolveScope(user);

    if (scope.level === 'UNRESTRICTED') return {};

    if (scope.level === 'SENATORIAL_DISTRICT') {
      return { OR: [STATE_WIDE, { targetLga: { senatorialDistrictId: scope.id } }] };
    }

    if (scope.level === 'LGA') {
      return { OR: [STATE_WIDE, { targetLgaId: scope.id }] };
    }

    if (scope.level === 'WARD') {
      const ward = await this.prisma.ward.findUnique({
        where: { id: scope.id },
        select: { lgaId: true },
      });
      return {
        OR: [
          STATE_WIDE,
          ...(ward ? [{ targetLgaId: ward.lgaId, targetWardId: null }] : []),
          { targetWardId: scope.id },
        ],
      };
    }

    if (scope.level === 'POLLING_UNIT') {
      const pollingUnit = await this.prisma.pollingUnit.findUnique({
        where: { id: scope.id },
        select: { wardId: true, ward: { select: { lgaId: true } } },
      });
      return {
        OR: [
          STATE_WIDE,
          ...(pollingUnit
            ? [
                { targetLgaId: pollingUnit.ward.lgaId, targetWardId: null },
                { targetWardId: pollingUnit.wardId, targetPollingUnitId: null },
              ]
            : []),
          { targetPollingUnitId: scope.id },
        ],
      };
    }

    return NO_ACCESS;
  }

  /** Single-record equivalent of `eventScopeWhere`, for direct-fetch-by-id checks. Primary scope only — see note above. */
  async assertCanViewEvent(
    user: AuthenticatedUser,
    event: { targetLgaId: string | null; targetWardId: string | null; targetPollingUnitId: string | null },
  ): Promise<void> {
    const scope = resolveScope(user);
    if (scope.level === 'UNRESTRICTED') return;
    if (!event.targetLgaId) return; // state-wide

    if (scope.level === 'SENATORIAL_DISTRICT') {
      const lga = await this.prisma.lGA.findUnique({
        where: { id: event.targetLgaId },
        select: { senatorialDistrictId: true },
      });
      if (lga?.senatorialDistrictId === scope.id) return;
    }

    if (scope.level === 'LGA' && scope.id === event.targetLgaId) return;

    if (scope.level === 'WARD') {
      if (scope.id === event.targetWardId) return;
      const ward = await this.prisma.ward.findUnique({ where: { id: scope.id }, select: { lgaId: true } });
      if (ward && !event.targetWardId && ward.lgaId === event.targetLgaId) return;
    }

    if (scope.level === 'POLLING_UNIT') {
      if (scope.id === event.targetPollingUnitId) return;
      const pollingUnit = await this.prisma.pollingUnit.findUnique({
        where: { id: scope.id },
        select: { wardId: true, ward: { select: { lgaId: true } } },
      });
      if (pollingUnit) {
        if (!event.targetPollingUnitId && pollingUnit.wardId === event.targetWardId) return;
        if (!event.targetWardId && pollingUnit.ward.lgaId === event.targetLgaId) return;
      }
    }

    throw new ForbiddenException('This event is outside your assigned organizational scope.');
  }

  private allocationWhereForScope(scope: ResolvedScope): Prisma.ResourceAllocationWhereInput {
    switch (scope.level) {
      case 'UNRESTRICTED':
        return {};
      case 'SENATORIAL_DISTRICT':
        return { targetLga: { senatorialDistrictId: scope.id } };
      case 'LGA':
        return { targetLgaId: scope.id };
      case 'WARD':
        return { targetWardId: scope.id };
      case 'POLLING_UNIT':
        return { targetPollingUnitId: scope.id };
      case 'NONE':
        return NO_ACCESS;
    }
  }

  /**
   * Resource allocations always target a concrete unit (no state-wide
   * case), and — unlike events — a scoped role only needs to see allocations
   * at or within its own unit, not broader ones above it. So this is a
   * plain equality filter, no ancestor resolution required — OR'd across
   * every scope the user holds.
   */
  resourceAllocationScopeWhere(user: AuthenticatedUser): Prisma.ResourceAllocationWhereInput {
    const scopes = resolveAllScopes(user);
    if (scopes.length === 1) return this.allocationWhereForScope(scopes[0]);
    const clauses = scopes.map((s) => this.allocationWhereForScope(s)).filter((c) => c !== NO_ACCESS);
    return clauses.length > 0 ? { OR: clauses } : NO_ACCESS;
  }

  /**
   * Which LGAs/Wards an actor's own assignment falls within — used by
   * reports to decide which breakdown rows to even show. Distinct from
   * `assertCanAccessOrgUnit`'s exact-match semantics: a WARD_ADMIN's ward
   * doesn't literally equal an LGA id, so answering "which LGA am I in"
   * needs the same ancestor lookup `eventScopeWhere` does.
   *
   * Primary scope only — see the note on `eventScopeWhere`.
   */
  async resolveVisibleUnits(
    user: AuthenticatedUser,
  ): Promise<{ lgaIds: 'ALL' | string[]; wardIds: 'ALL' | string[] }> {
    const scope = resolveScope(user);

    if (scope.level === 'UNRESTRICTED') {
      return { lgaIds: 'ALL', wardIds: 'ALL' };
    }

    if (scope.level === 'SENATORIAL_DISTRICT') {
      const lgas = await this.prisma.lGA.findMany({
        where: { senatorialDistrictId: scope.id },
        select: { id: true },
      });
      const lgaIds = lgas.map((l) => l.id);
      const wards = await this.prisma.ward.findMany({
        where: { lgaId: { in: lgaIds } },
        select: { id: true },
      });
      return { lgaIds, wardIds: wards.map((w) => w.id) };
    }

    if (scope.level === 'LGA') {
      const wards = await this.prisma.ward.findMany({
        where: { lgaId: scope.id },
        select: { id: true },
      });
      return { lgaIds: [scope.id], wardIds: wards.map((w) => w.id) };
    }

    if (scope.level === 'WARD') {
      const ward = await this.prisma.ward.findUnique({
        where: { id: scope.id },
        select: { lgaId: true },
      });
      return { lgaIds: ward ? [ward.lgaId] : [], wardIds: [scope.id] };
    }

    if (scope.level === 'POLLING_UNIT') {
      const pollingUnit = await this.prisma.pollingUnit.findUnique({
        where: { id: scope.id },
        select: { wardId: true, ward: { select: { lgaId: true } } },
      });
      return {
        lgaIds: pollingUnit ? [pollingUnit.ward.lgaId] : [],
        wardIds: pollingUnit ? [pollingUnit.wardId] : [],
      };
    }

    return { lgaIds: [], wardIds: [] };
  }

  /**
   * The full named ancestor chain for a user's PRIMARY scope, for UI display
   * only (e.g. "Gombe Central / Akko / Kumo Central"). Never used for access
   * control — that's `resolveScope`/`resolveAllScopes` above, working from
   * IDs alone. Does not reflect additional UserScope grants.
   */
  async resolveScopePath(user: AuthenticatedUser): Promise<ScopePath> {
    const scope = resolveScope(user);

    if (scope.level === 'POLLING_UNIT') {
      const pollingUnit = await this.prisma.pollingUnit.findUnique({
        where: { id: scope.id },
        select: {
          id: true,
          name: true,
          ward: {
            select: {
              id: true,
              name: true,
              lga: { select: { id: true, name: true, senatorialDistrict: { select: { id: true, name: true } } } },
            },
          },
        },
      });
      if (!pollingUnit) return {};
      return {
        senatorialDistrict: pollingUnit.ward.lga.senatorialDistrict,
        lga: { id: pollingUnit.ward.lga.id, name: pollingUnit.ward.lga.name },
        ward: { id: pollingUnit.ward.id, name: pollingUnit.ward.name },
        pollingUnit: { id: pollingUnit.id, name: pollingUnit.name },
      };
    }

    if (scope.level === 'WARD') {
      const ward = await this.prisma.ward.findUnique({
        where: { id: scope.id },
        select: {
          id: true,
          name: true,
          lga: { select: { id: true, name: true, senatorialDistrict: { select: { id: true, name: true } } } },
        },
      });
      if (!ward) return {};
      return {
        senatorialDistrict: ward.lga.senatorialDistrict,
        lga: { id: ward.lga.id, name: ward.lga.name },
        ward: { id: ward.id, name: ward.name },
      };
    }

    if (scope.level === 'LGA') {
      const lga = await this.prisma.lGA.findUnique({
        where: { id: scope.id },
        select: { id: true, name: true, senatorialDistrict: { select: { id: true, name: true } } },
      });
      if (!lga) return {};
      return { senatorialDistrict: lga.senatorialDistrict, lga: { id: lga.id, name: lga.name } };
    }

    if (scope.level === 'SENATORIAL_DISTRICT') {
      const district = await this.prisma.senatorialDistrict.findUnique({
        where: { id: scope.id },
        select: { id: true, name: true },
      });
      return district ? { senatorialDistrict: district } : {};
    }

    return {};
  }
}

export interface ScopePath {
  senatorialDistrict?: { id: string; name: string };
  lga?: { id: string; name: string };
  ward?: { id: string; name: string };
  pollingUnit?: { id: string; name: string };
}
