import { ForbiddenException, Injectable } from '@nestjs/common';
import { CampaignRole, PermissionEffect } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  CAMPAIGN_PERMISSIONS,
  CampaignPermission,
  DEFAULT_CAMPAIGN_ROLE_PERMISSIONS,
  isCampaignPermission,
} from './campaign-permissions';

/**
 * A user's ADMINISTRATIVE Role/scope (User.role, User.lgaId, …) grants
 * NOTHING here, and a CampaignRole grants nothing on the administrative
 * side — these are deliberately separate authorization domains sharing
 * only the same login (JWT/User identity) and the same geography tables.
 * See the schema header above the Campaign models.
 *
 * The six geographic-coordinator roles form the authority ladder, highest
 * first. The five functional specialist roles are narrow-purpose
 * assignments, not a management chain — none of them can manage another
 * campaign user, the same way DATA_ENTRY_OFFICER can't in the
 * administrative domain.
 */
const CAMPAIGN_GEOGRAPHIC_HIERARCHY: CampaignRole[] = [
  CampaignRole.CAMPAIGN_SUPER_ADMIN,
  CampaignRole.STATE_CAMPAIGN_COORDINATOR,
  CampaignRole.DISTRICT_COORDINATOR,
  CampaignRole.LGA_COORDINATOR,
  CampaignRole.WARD_COORDINATOR,
  CampaignRole.POLLING_UNIT_COORDINATOR,
];

const CAMPAIGN_FUNCTIONAL_ROLES: CampaignRole[] = [
  CampaignRole.CAMPAIGN_DATA_OFFICER,
  CampaignRole.EVENT_COORDINATOR,
  CampaignRole.LOGISTICS_OFFICER,
  CampaignRole.VOLUNTEER_COORDINATOR,
  CampaignRole.REPORT_VIEWER,
];

export function campaignRankOf(role: CampaignRole): number {
  return CAMPAIGN_GEOGRAPHIC_HIERARCHY.indexOf(role);
}

export function humanCampaignRole(role: CampaignRole): string {
  return role.replaceAll('_', ' ').toLowerCase();
}

/** Pure role-authority check for the campaign domain — mirrors hierarchyAllows in common/authorization. */
export function campaignHierarchyAllows(actorRole: CampaignRole, targetRole: CampaignRole): boolean {
  if (actorRole === CampaignRole.CAMPAIGN_SUPER_ADMIN) return true;
  if (CAMPAIGN_FUNCTIONAL_ROLES.includes(actorRole)) return false;
  const actorRank = campaignRankOf(actorRole);
  if (actorRank === -1) return false;
  if (CAMPAIGN_FUNCTIONAL_ROLES.includes(targetRole)) return true; // any coordinator may delegate a narrow functional role within their own scope
  const targetRank = campaignRankOf(targetRole);
  return targetRank > actorRank;
}

export interface CampaignScope {
  senatorialDistrictId?: string | null;
  lgaId?: string | null;
  wardId?: string | null;
  pollingUnitId?: string | null;
}

type CampaignActorScope =
  | { level: 'UNRESTRICTED' }
  | { level: 'SENATORIAL_DISTRICT'; id: string }
  | { level: 'LGA'; id: string }
  | { level: 'WARD'; id: string }
  | { level: 'POLLING_UNIT'; id: string }
  | { level: 'NONE' };

/** Reduces a scope payload to the single field that matters for `role` — mirrors canonicalScope in common/authorization. */
export function canonicalCampaignScope(role: CampaignRole, raw: CampaignScope): CampaignScope {
  switch (role) {
    case CampaignRole.DISTRICT_COORDINATOR:
      return { senatorialDistrictId: raw.senatorialDistrictId ?? undefined };
    case CampaignRole.LGA_COORDINATOR:
      return { lgaId: raw.lgaId ?? undefined };
    case CampaignRole.WARD_COORDINATOR:
      return { wardId: raw.wardId ?? undefined };
    case CampaignRole.POLLING_UNIT_COORDINATOR:
      return { pollingUnitId: raw.pollingUnitId ?? undefined };
    case CampaignRole.CAMPAIGN_SUPER_ADMIN:
    case CampaignRole.STATE_CAMPAIGN_COORDINATOR:
      return {};
    default:
      // Functional roles: configurable, most specific first — same as DATA_ENTRY_OFFICER.
      if (raw.pollingUnitId) return { pollingUnitId: raw.pollingUnitId };
      if (raw.wardId) return { wardId: raw.wardId };
      if (raw.lgaId) return { lgaId: raw.lgaId };
      if (raw.senatorialDistrictId) return { senatorialDistrictId: raw.senatorialDistrictId };
      return {};
  }
}

/** Most-specific-first reduction, for entities (teams/events/tasks/…) that aren't tied to a CampaignRole but still take exactly one scope level. */
export function reduceCampaignScope(raw: CampaignScope): CampaignScope {
  if (raw.pollingUnitId) return { pollingUnitId: raw.pollingUnitId };
  if (raw.wardId) return { wardId: raw.wardId };
  if (raw.lgaId) return { lgaId: raw.lgaId };
  if (raw.senatorialDistrictId) return { senatorialDistrictId: raw.senatorialDistrictId };
  return {};
}

export function compactCampaignScope(source: CampaignScope): Record<string, string> {
  const out: Record<string, string> = {};
  if (source.senatorialDistrictId) out.senatorialDistrictId = source.senatorialDistrictId;
  if (source.lgaId) out.lgaId = source.lgaId;
  if (source.wardId) out.wardId = source.wardId;
  if (source.pollingUnitId) out.pollingUnitId = source.pollingUnitId;
  return out;
}

export type CampaignDenialReasonCode =
  | 'TARGET_ROLE_AUTHORITY_TOO_HIGH'
  | 'GEOGRAPHIC_SCOPE_VIOLATION'
  | 'ACTOR_SCOPE_UNCONFIGURED'
  | 'SELF_ESCALATION_ATTEMPT'
  | 'NO_CAMPAIGN_MEMBERSHIP'
  | 'MEMBERSHIP_DISABLED'
  | 'PERMISSION_NOT_POSSESSED';

export interface CampaignAuthDecision {
  allowed: boolean;
  reasonCode?: CampaignDenialReasonCode;
  reason?: string;
}

const ALLOWED: CampaignAuthDecision = { allowed: true };

export interface CampaignMembershipLike {
  id: string;
  campaignId: string;
  userId: string;
  role: CampaignRole;
  status: 'ACTIVE' | 'DISABLED';
  senatorialDistrictId: string | null;
  lgaId: string | null;
  wardId: string | null;
  pollingUnitId: string | null;
}

/**
 * Centralized authorization for the Campaign Operations module — mirrors
 * common/authorization/AuthorizationService's pattern (role authority +
 * permission + geographic scope, self-escalation blocked, every denial
 * audited) for this separate domain. Deliberately not a subclass/reuse of
 * the administrative service: the two role enums and scope semantics are
 * not interchangeable, and conflating them is exactly what the spec's
 * "campaign role != administrative role" requirement forbids.
 */
@Injectable()
export class CampaignAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** The caller's membership for a campaign, or null if they have none at all. Does not check status. */
  async getMembership(userId: string, campaignId: string): Promise<CampaignMembershipLike | null> {
    return this.prisma.campaignMembership.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    });
  }

  /** Loads the caller's membership and throws if absent/disabled — the entry point every campaign controller uses. */
  async requireActiveMembership(actor: AuthenticatedUser, campaignId: string): Promise<CampaignMembershipLike> {
    const membership = await this.getMembership(actor.id, campaignId);
    if (!membership) {
      throw new ForbiddenException('You do not have a campaign role on this campaign.');
    }
    if (membership.status !== 'ACTIVE') {
      throw new ForbiddenException('Your campaign account has been disabled.');
    }
    return membership;
  }

  // ───────────────────────── Role / scope delegation ─────────────────────

  canAssignCampaignRole(actorRole: CampaignRole, targetRole: CampaignRole): boolean {
    return campaignHierarchyAllows(actorRole, targetRole);
  }

  async canAssignCampaignScope(actor: CampaignMembershipLike, targetScope: CampaignScope): Promise<boolean> {
    const scope = this.resolveActorScope(actor);
    return this.isWithinScope(scope, targetScope);
  }

  /** Full authorization for creating/updating a campaign user with `targetRole`/`targetScope`. */
  async evaluateMembershipChange(
    actor: CampaignMembershipLike,
    targetRole: CampaignRole,
    targetScope: CampaignScope,
  ): Promise<CampaignAuthDecision> {
    if (!campaignHierarchyAllows(actor.role, targetRole)) {
      return {
        allowed: false,
        reasonCode: 'TARGET_ROLE_AUTHORITY_TOO_HIGH',
        reason: `Your campaign role (${humanCampaignRole(actor.role)}) is not authorized to manage ${humanCampaignRole(targetRole)} accounts.`,
      };
    }

    const actorScope = this.resolveActorScope(actor);
    if (actorScope.level === 'NONE') {
      return {
        allowed: false,
        reasonCode: 'ACTOR_SCOPE_UNCONFIGURED',
        reason: 'Your campaign account has no valid geographic scope assigned.',
      };
    }
    const within = await this.isWithinScope(actorScope, targetScope);
    if (!within) {
      return {
        allowed: false,
        reasonCode: 'GEOGRAPHIC_SCOPE_VIOLATION',
        reason: 'That assignment is outside your campaign geographic scope.',
      };
    }

    return ALLOWED;
  }

  async recordMembershipDenial(
    actor: AuthenticatedUser,
    campaignId: string,
    decision: CampaignAuthDecision,
    context: { attemptedAction: string; targetRole?: CampaignRole; targetScope?: CampaignScope; targetUserId?: string },
  ): Promise<void> {
    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_MANAGEMENT_DENIED,
      entityType: 'CampaignMembership',
      entityId: context.targetUserId ?? null,
      metadata: {
        campaignId,
        attemptedAction: context.attemptedAction,
        targetRole: context.targetRole,
        targetScope: context.targetScope ? compactCampaignScope(context.targetScope) : undefined,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
      },
    });
  }

  async recordSelfEscalationAttempt(actor: AuthenticatedUser, campaignId: string): Promise<void> {
    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_MANAGEMENT_DENIED,
      entityType: 'CampaignMembership',
      entityId: actor.id,
      metadata: {
        campaignId,
        attemptedAction: 'self-escalation',
        reasonCode: 'SELF_ESCALATION_ATTEMPT' satisfies CampaignDenialReasonCode,
        reason: 'A user cannot change their own campaign role or geographic scope.',
      },
    });
  }

  /**
   * The scope a new team/event/task/volunteer/activity should get when the
   * request specifies none — the actor's own scope, most-specific-first.
   * An UNRESTRICTED actor with none supplied gets an empty (campaign-wide)
   * scope, same as leaving it unset for a statewide administrative role.
   */
  defaultScope(raw: CampaignScope, actor: CampaignMembershipLike): CampaignScope {
    const reduced = reduceCampaignScope(raw);
    if (Object.keys(compactCampaignScope(reduced)).length > 0) return reduced;
    return reduceCampaignScope(actor);
  }

  // ────────────────────── Resource-level scope (IDOR guard) ───────────────

  /**
   * Throws unless `target`'s geography is within the actor's campaign
   * scope — the IDOR/BOLA guard every campaign sub-resource (event, team,
   * task, volunteer, activity) must pass before returning or mutating a
   * record fetched by id. Knowing an id is never sufficient.
   */
  async assertCanAccessCampaignScope(actor: CampaignMembershipLike, target: CampaignScope): Promise<void> {
    const scope = this.resolveActorScope(actor);
    if (!(await this.isWithinScope(scope, target))) {
      throw new ForbiddenException('This record is outside your campaign geographic scope.');
    }
  }

  /** Prisma `where` fragment restricting a campaign-scoped list to what the actor may see. */
  scopeWhere(actor: CampaignMembershipLike): Record<string, unknown> {
    const scope = this.resolveActorScope(actor);
    switch (scope.level) {
      case 'UNRESTRICTED':
        return {};
      case 'SENATORIAL_DISTRICT':
        return { OR: [{ senatorialDistrictId: scope.id }, { lga: { senatorialDistrictId: scope.id } }, { ward: { lga: { senatorialDistrictId: scope.id } } }, { pollingUnit: { ward: { lga: { senatorialDistrictId: scope.id } } } }] };
      case 'LGA':
        return { OR: [{ lgaId: scope.id }, { ward: { lgaId: scope.id } }, { pollingUnit: { ward: { lgaId: scope.id } } }] };
      case 'WARD':
        return { OR: [{ wardId: scope.id }, { pollingUnit: { wardId: scope.id } }] };
      case 'POLLING_UNIT':
        return { pollingUnitId: scope.id };
      case 'NONE':
        return { id: '__no_access__' };
    }
  }

  resolveActorScope(actor: { role: CampaignRole } & CampaignScope): CampaignActorScope {
    if (actor.role === CampaignRole.CAMPAIGN_SUPER_ADMIN || actor.role === CampaignRole.STATE_CAMPAIGN_COORDINATOR) {
      return { level: 'UNRESTRICTED' };
    }
    if (actor.role === CampaignRole.DISTRICT_COORDINATOR) {
      return actor.senatorialDistrictId ? { level: 'SENATORIAL_DISTRICT', id: actor.senatorialDistrictId } : { level: 'NONE' };
    }
    if (actor.role === CampaignRole.LGA_COORDINATOR) {
      return actor.lgaId ? { level: 'LGA', id: actor.lgaId } : { level: 'NONE' };
    }
    if (actor.role === CampaignRole.WARD_COORDINATOR) {
      return actor.wardId ? { level: 'WARD', id: actor.wardId } : { level: 'NONE' };
    }
    if (actor.role === CampaignRole.POLLING_UNIT_COORDINATOR) {
      return actor.pollingUnitId ? { level: 'POLLING_UNIT', id: actor.pollingUnitId } : { level: 'NONE' };
    }
    // Functional roles: configurable, most specific first.
    if (actor.pollingUnitId) return { level: 'POLLING_UNIT', id: actor.pollingUnitId };
    if (actor.wardId) return { level: 'WARD', id: actor.wardId };
    if (actor.lgaId) return { level: 'LGA', id: actor.lgaId };
    if (actor.senatorialDistrictId) return { level: 'SENATORIAL_DISTRICT', id: actor.senatorialDistrictId };
    return { level: 'NONE' };
  }

  private async isWithinScope(scope: CampaignActorScope, target: CampaignScope): Promise<boolean> {
    if (scope.level === 'UNRESTRICTED') return true;
    if (scope.level === 'NONE') return false;

    if (scope.level === 'SENATORIAL_DISTRICT') {
      if (target.senatorialDistrictId) return target.senatorialDistrictId === scope.id;
      const lgaId = await this.resolveLgaId(target);
      if (!lgaId) return false;
      const lga = await this.prisma.lGA.findUnique({ where: { id: lgaId }, select: { senatorialDistrictId: true } });
      return lga?.senatorialDistrictId === scope.id;
    }

    if (scope.level === 'LGA') {
      if (target.senatorialDistrictId) return false;
      if (target.lgaId) return target.lgaId === scope.id;
      const lgaId = await this.resolveLgaId(target);
      return lgaId === scope.id;
    }

    if (scope.level === 'WARD') {
      if (target.senatorialDistrictId || target.lgaId) return false;
      if (target.wardId) return target.wardId === scope.id;
      if (target.pollingUnitId) {
        const pu = await this.prisma.pollingUnit.findUnique({ where: { id: target.pollingUnitId }, select: { wardId: true } });
        return pu?.wardId === scope.id;
      }
      return false;
    }

    if (scope.level === 'POLLING_UNIT') {
      if (target.senatorialDistrictId || target.lgaId || target.wardId) return false;
      if (target.pollingUnitId) return target.pollingUnitId === scope.id;
      return false;
    }

    return false;
  }

  private async resolveLgaId(target: CampaignScope): Promise<string | null> {
    if (target.lgaId) return target.lgaId;
    if (target.wardId) {
      const ward = await this.prisma.ward.findUnique({ where: { id: target.wardId }, select: { lgaId: true } });
      return ward?.lgaId ?? null;
    }
    if (target.pollingUnitId) {
      const pu = await this.prisma.pollingUnit.findUnique({
        where: { id: target.pollingUnitId },
        select: { ward: { select: { lgaId: true } } },
      });
      return pu?.ward.lgaId ?? null;
    }
    return null;
  }

  // ────────────────────────────── Permissions ─────────────────────────────

  async getCampaignRolePermissions(role: CampaignRole): Promise<Set<CampaignPermission>> {
    const rows = await this.prisma.campaignRolePermission.findMany({ where: { role }, select: { permission: true } });
    if (rows.length === 0) return new Set(DEFAULT_CAMPAIGN_ROLE_PERMISSIONS[role]);
    return new Set(rows.map((r) => r.permission).filter(isCampaignPermission));
  }

  async getEffectiveCampaignPermissions(membership: { id: string; role: CampaignRole }): Promise<Set<CampaignPermission>> {
    const base = await this.getCampaignRolePermissions(membership.role);
    const overrides = await this.prisma.campaignMembershipPermission.findMany({
      where: { membershipId: membership.id },
      select: { permission: true, effect: true },
    });
    for (const o of overrides) {
      if (!isCampaignPermission(o.permission)) continue;
      if (o.effect === PermissionEffect.GRANT) base.add(o.permission);
      else base.delete(o.permission);
    }
    return base;
  }

  async hasCampaignPermission(membership: { id: string; role: CampaignRole }, permission: string): Promise<boolean> {
    if (!isCampaignPermission(permission)) return false;
    return (await this.getEffectiveCampaignPermissions(membership)).has(permission);
  }
}
