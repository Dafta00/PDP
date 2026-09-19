import { ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionEffect, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../../audit/audit.service';
import { OrgScopeService } from '../scope/org-scope.service';
import { AuthenticatedUser } from '../types/authenticated-user';
import { DEFAULT_ROLE_PERMISSIONS, DELEGABLE_PERMISSIONS, Permission, isPermission } from './permissions';

/**
 * Authority ordering, highest first. A user may only create/assign/edit/
 * deactivate/manage a target whose role sits STRICTLY LOWER in this list
 * than their own — never equal, never higher. SUPER_ADMIN is the one
 * exception (see `hierarchyAllows`): it is the system's single unrestricted
 * authority and may manage any account, including another SUPER_ADMIN.
 */
export const ROLE_HIERARCHY: Role[] = [
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
  Role.POLLING_UNIT_OFFICER,
  Role.DATA_ENTRY_OFFICER,
];

export function rankOf(role: Role): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function humanRole(role: Role): string {
  return role.replaceAll('_', ' ').toLowerCase();
}

/**
 * Pure role-authority check — no geography, no permissions. SUPER_ADMIN is
 * the system's only unrestricted authority and may manage any role
 * including its own; every other role must strictly outrank the target.
 */
export function hierarchyAllows(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === Role.SUPER_ADMIN) return true;
  return rankOf(targetRole) > rankOf(actorRole);
}

export interface TargetScope {
  senatorialDistrictId?: string | null;
  lgaId?: string | null;
  wardId?: string | null;
  pollingUnitId?: string | null;
}

type ActorScope =
  | { level: 'UNRESTRICTED' }
  | { level: 'SENATORIAL_DISTRICT'; id: string }
  | { level: 'LGA'; id: string }
  | { level: 'WARD'; id: string }
  | { level: 'POLLING_UNIT'; id: string }
  | { level: 'NONE' };

/**
 * Reduces an arbitrary scope payload (which a client could stuff with
 * several fields at once) down to the single field that actually matters
 * for the given role — e.g. a WARD_ADMIN's scope is always exactly
 * `wardId`, regardless of whatever `lgaId`/`senatorialDistrictId` a request
 * body also included. DATA_ENTRY_OFFICER is configurable — it keeps
 * whichever single field is most specific, mirroring OrgScopeService.
 */
export function canonicalScope(role: Role, raw: TargetScope): TargetScope {
  switch (role) {
    case Role.SENATORIAL_ADMIN:
      return { senatorialDistrictId: raw.senatorialDistrictId ?? undefined };
    case Role.LGA_ADMIN:
      return { lgaId: raw.lgaId ?? undefined };
    case Role.WARD_ADMIN:
      return { wardId: raw.wardId ?? undefined };
    case Role.POLLING_UNIT_OFFICER:
      return { pollingUnitId: raw.pollingUnitId ?? undefined };
    case Role.DATA_ENTRY_OFFICER:
      if (raw.pollingUnitId) return { pollingUnitId: raw.pollingUnitId };
      if (raw.wardId) return { wardId: raw.wardId };
      if (raw.lgaId) return { lgaId: raw.lgaId };
      if (raw.senatorialDistrictId) return { senatorialDistrictId: raw.senatorialDistrictId };
      return {};
    default:
      return {}; // SUPER_ADMIN / STATE_ADMIN — unrestricted, no scope
  }
}

export function compactScope(source: TargetScope): Record<string, string> {
  const out: Record<string, string> = {};
  if (source.senatorialDistrictId) out.senatorialDistrictId = source.senatorialDistrictId;
  if (source.lgaId) out.lgaId = source.lgaId;
  if (source.wardId) out.wardId = source.wardId;
  if (source.pollingUnitId) out.pollingUnitId = source.pollingUnitId;
  return out;
}

/** Machine-readable denial reasons, for audit metadata and (later) programmatic handling. */
export type DenialReasonCode =
  | 'TARGET_ROLE_AUTHORITY_TOO_HIGH'
  | 'GEOGRAPHIC_SCOPE_VIOLATION'
  | 'ACTOR_SCOPE_UNCONFIGURED'
  | 'PU_OFFICER_NOT_GRANTED'
  | 'PU_OFFICER_INVALID_TARGET_ROLE'
  | 'SELF_ESCALATION_ATTEMPT'
  | 'PERMISSION_NOT_POSSESSED'
  | 'PERMISSION_NOT_DELEGABLE';

export interface AuthDecision {
  allowed: boolean;
  reasonCode?: DenialReasonCode;
  reason?: string;
}

const ALLOWED: AuthDecision = { allowed: true };

function resolveActorScope(actor: AuthenticatedUser): ActorScope {
  if (actor.role === Role.SUPER_ADMIN || actor.role === Role.STATE_ADMIN) return { level: 'UNRESTRICTED' };
  if (actor.role === Role.SENATORIAL_ADMIN) {
    return actor.senatorialDistrictId
      ? { level: 'SENATORIAL_DISTRICT', id: actor.senatorialDistrictId }
      : { level: 'NONE' };
  }
  if (actor.role === Role.LGA_ADMIN) {
    return actor.lgaId ? { level: 'LGA', id: actor.lgaId } : { level: 'NONE' };
  }
  if (actor.role === Role.WARD_ADMIN) {
    return actor.wardId ? { level: 'WARD', id: actor.wardId } : { level: 'NONE' };
  }
  if (actor.role === Role.POLLING_UNIT_OFFICER) {
    return actor.pollingUnitId ? { level: 'POLLING_UNIT', id: actor.pollingUnitId } : { level: 'NONE' };
  }
  return { level: 'NONE' }; // DATA_ENTRY_OFFICER (or anything else) never manages users
}

function resolveAdditionalActorScope(row: TargetScope): ActorScope {
  if (row.pollingUnitId) return { level: 'POLLING_UNIT', id: row.pollingUnitId };
  if (row.wardId) return { level: 'WARD', id: row.wardId };
  if (row.lgaId) return { level: 'LGA', id: row.lgaId };
  if (row.senatorialDistrictId) return { level: 'SENATORIAL_DISTRICT', id: row.senatorialDistrictId };
  return { level: 'NONE' };
}

/** Every unit-management scope this actor holds: their primary role-scope, plus any SUPER_ADMIN-granted UserScope rows. */
function resolveAllActorScopes(actor: AuthenticatedUser): ActorScope[] {
  const primary = resolveActorScope(actor);
  if (primary.level === 'UNRESTRICTED') return [primary];
  const additional = (actor.additionalScopes ?? []).map(resolveAdditionalActorScope);
  const scopes = [primary, ...additional].filter((s) => s.level !== 'NONE');
  return scopes.length > 0 ? scopes : [{ level: 'NONE' }];
}

/**
 * Centralized authorization: every protected operation in the app should
 * ultimately call into this service rather than re-deriving role/scope/
 * permission logic locally. Combines four independent checks — role
 * authority, permission, geographic scope, and (for user management)
 * self-escalation — per the "ROLE AUTHORITY + PERMISSION + GEOGRAPHIC SCOPE
 * + TARGET ROLE = AUTHORIZED ACTION" rule: any one failing denies the whole
 * operation.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orgScope: OrgScopeService,
  ) {}

  // ───────────────────────── Role / scope delegation ─────────────────────

  /** Step 2 of the role-assignment workflow: is `targetRole` strictly below the actor's own authority (or is the actor SUPER_ADMIN)? */
  canAssignRole(actor: AuthenticatedUser, targetRole: Role): boolean {
    return hierarchyAllows(actor.role, targetRole);
  }

  /** Is `targetScope` contained within any scope (primary or SUPER_ADMIN-granted additional) the actor holds? */
  async canAssignScope(actor: AuthenticatedUser, targetScope: TargetScope): Promise<boolean> {
    for (const scope of resolveAllActorScopes(actor)) {
      if (await this.isWithinScope(scope, targetScope)) return true;
    }
    return false;
  }

  /** Full authorization for creating a user with `targetRole`/`targetScope` — the entry point UsersService.create calls. */
  async canCreateUser(actor: AuthenticatedUser, targetRole: Role, targetScope: TargetScope): Promise<AuthDecision> {
    const decision = await this.evaluateUserManagement(actor, targetRole, targetScope);
    if (!decision.allowed) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.USER_MANAGEMENT_DENIED,
        entityType: 'User',
        entityId: null,
        metadata: {
          actorRole: actor.role,
          actorScope: compactScope(actor),
          attemptedAction: 'create',
          targetRole,
          targetScope: compactScope(targetScope),
          reason: decision.reason,
          reasonCode: decision.reasonCode,
        },
      });
    }
    return decision;
  }

  /** Full authorization for updating an existing user to `targetRole`/`targetScope` (their current OR proposed-next state). */
  async canUpdateUser(
    actor: AuthenticatedUser,
    targetUserId: string,
    targetRole: Role,
    targetScope: TargetScope,
  ): Promise<AuthDecision> {
    const decision = await this.evaluateUserManagement(actor, targetRole, targetScope);
    if (!decision.allowed) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.USER_MANAGEMENT_DENIED,
        entityType: 'User',
        entityId: targetUserId,
        metadata: {
          actorRole: actor.role,
          actorScope: compactScope(actor),
          attemptedAction: 'update',
          targetRole,
          targetScope: compactScope(targetScope),
          reason: decision.reason,
          reasonCode: decision.reasonCode,
        },
      });
    }
    return decision;
  }

  /** Records a denied self-escalation attempt (role/status/scope change on one's own account). Call before throwing. */
  async recordSelfEscalationAttempt(actor: AuthenticatedUser): Promise<void> {
    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_MANAGEMENT_DENIED,
      entityType: 'User',
      entityId: actor.id,
      metadata: {
        actorRole: actor.role,
        attemptedAction: 'self-escalation',
        reasonCode: 'SELF_ESCALATION_ATTEMPT' satisfies DenialReasonCode,
        reason: 'A user cannot change their own role, status, or geographic scope.',
      },
    });
  }

  private async evaluateUserManagement(
    actor: AuthenticatedUser,
    targetRole: Role,
    targetScope: TargetScope,
  ): Promise<AuthDecision> {
    if (actor.role === Role.POLLING_UNIT_OFFICER) {
      if (!actor.canCreateUsers) {
        return {
          allowed: false,
          reasonCode: 'PU_OFFICER_NOT_GRANTED',
          reason: 'You are not authorized to create or manage user accounts. Ask a Super Admin to enable this for your account.',
        };
      }
      if (targetRole !== Role.DATA_ENTRY_OFFICER) {
        return {
          allowed: false,
          reasonCode: 'PU_OFFICER_INVALID_TARGET_ROLE',
          reason: 'A Polling Unit Officer may only create or manage Data Entry Officer accounts.',
        };
      }
    }

    if (!hierarchyAllows(actor.role, targetRole)) {
      return {
        allowed: false,
        reasonCode: 'TARGET_ROLE_AUTHORITY_TOO_HIGH',
        reason: `Your role (${humanRole(actor.role)}) is not authorized to manage ${humanRole(targetRole)} accounts.`,
      };
    }

    const scopes = resolveAllActorScopes(actor);
    if (scopes.length === 1 && scopes[0].level === 'NONE') {
      return {
        allowed: false,
        reasonCode: 'ACTOR_SCOPE_UNCONFIGURED',
        reason: 'Your account has no valid organizational scope assigned.',
      };
    }
    const within = await this.canAssignScope(actor, targetScope);
    if (!within) {
      return {
        allowed: false,
        reasonCode: 'GEOGRAPHIC_SCOPE_VIOLATION',
        reason: 'That account is outside your assigned organizational scope.',
      };
    }

    return ALLOWED;
  }

  private async isWithinScope(scope: ActorScope, target: TargetScope): Promise<boolean> {
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
      if (target.senatorialDistrictId) return false; // a district-wide target is broader than an LGA, never "within" one
      if (target.lgaId) return target.lgaId === scope.id;
      const lgaId = await this.resolveLgaId(target);
      return lgaId === scope.id;
    }

    if (scope.level === 'WARD') {
      if (target.senatorialDistrictId || target.lgaId) return false;
      if (target.wardId) return target.wardId === scope.id;
      if (target.pollingUnitId) {
        const pu = await this.prisma.pollingUnit.findUnique({
          where: { id: target.pollingUnitId },
          select: { wardId: true },
        });
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

  private async resolveLgaId(target: TargetScope): Promise<string | null> {
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

  // ───────────────────────────── Permissions ──────────────────────────────

  /** A role's default permission set — DB-backed (RolePermission), falling back to the code default when nobody has seeded/edited it yet. */
  async getRolePermissions(role: Role): Promise<Set<Permission>> {
    const rows = await this.prisma.rolePermission.findMany({ where: { role }, select: { permission: true } });
    if (rows.length === 0) return new Set(DEFAULT_ROLE_PERMISSIONS[role]);
    return new Set(rows.map((r) => r.permission).filter(isPermission));
  }

  /** A specific user's actual permission set: role defaults, with any personal GRANT/REVOKE overrides applied. */
  async getEffectivePermissions(user: AuthenticatedUser): Promise<Set<Permission>> {
    const base = await this.getRolePermissions(user.role);
    const overrides = await this.prisma.userPermission.findMany({
      where: { userId: user.id },
      select: { permission: true, effect: true },
    });
    for (const override of overrides) {
      if (!isPermission(override.permission)) continue;
      if (override.effect === PermissionEffect.GRANT) base.add(override.permission);
      else base.delete(override.permission);
    }
    return base;
  }

  async hasPermission(user: AuthenticatedUser, permission: string): Promise<boolean> {
    if (!isPermission(permission)) return false;
    const effective = await this.getEffectivePermissions(user);
    return effective.has(permission);
  }

  /**
   * Can `actor` hand `permission` to someone else? They must possess it
   * themselves — a user can never delegate authority they don't have — and
   * either be SUPER_ADMIN (who may delegate anything) or the permission
   * must be on the delegable allowlist (operational permissions only; the
   * users/roles/permissions/settings/audit families stay SUPER_ADMIN-only
   * regardless of who currently holds them).
   */
  async canGrantPermission(actor: AuthenticatedUser, permission: string): Promise<boolean> {
    if (!isPermission(permission)) return false;
    if (!(await this.hasPermission(actor, permission))) return false;
    if (actor.role === Role.SUPER_ADMIN) return true;
    return DELEGABLE_PERMISSIONS.has(permission);
  }

  // ────────────────────────── Resource-level checks ────────────────────────

  /** Can `actor` see/act on a member located in the given org unit? */
  async canAccessMember(
    actor: AuthenticatedUser,
    member: { lgaId?: string | null; wardId?: string | null; pollingUnitId?: string | null },
  ): Promise<boolean> {
    return this.orgScope.canAccessOrgUnit(actor, member);
  }

  /** Can `actor` operate at the given polling unit (e.g. record attendance, verify a member there)? */
  async canAccessPollingUnit(actor: AuthenticatedUser, pollingUnit: { id: string; wardId: string }): Promise<boolean> {
    const ward = await this.prisma.ward.findUnique({ where: { id: pollingUnit.wardId }, select: { lgaId: true } });
    return this.orgScope.canAccessOrgUnit(actor, {
      pollingUnitId: pollingUnit.id,
      wardId: pollingUnit.wardId,
      lgaId: ward?.lgaId,
    });
  }

  /** Generic org-unit-scoped resource check (resources, allocations, distributions, documents, …). */
  async canAccessResource(
    actor: AuthenticatedUser,
    resource: { lgaId?: string | null; wardId?: string | null; pollingUnitId?: string | null },
  ): Promise<boolean> {
    return this.orgScope.canAccessOrgUnit(actor, resource);
  }

  /** Can `actor` view reports at all (permission gate — the actual data is still filtered by OrgScopeService per-report). */
  async canViewReport(actor: AuthenticatedUser): Promise<boolean> {
    return this.hasPermission(actor, 'reports.view');
  }

  /**
   * Absolute NIN-visibility rule: SUPER_ADMIN only, deliberately NOT
   * permission-based. Every other check in this service can be widened by
   * granting a permission (UserPermission GRANT) or an additional scope —
   * NIN access must never be grantable that way, so this is a hard role
   * check with no override path. Callers must gate the decrypted value on
   * this, not on any permission string.
   */
  canViewMemberNIN(actor: AuthenticatedUser): boolean {
    return actor.role === Role.SUPER_ADMIN;
  }

  // ────────────────────────── Role permission defaults ─────────────────────

  /** Every role's current default permission set — DB-backed with the code fallback, same as getRolePermissions. */
  async listRolePermissions(): Promise<Record<Role, Permission[]>> {
    const result = {} as Record<Role, Permission[]>;
    for (const role of ROLE_HIERARCHY) {
      result[role] = Array.from(await this.getRolePermissions(role)).sort();
    }
    return result;
  }

  /**
   * Replaces a role's default permission set. SUPER_ADMIN-only — this is
   * system role configuration, not per-user delegation (see
   * canGrantPermission for that), and changing it changes what every
   * current and future holder of the role can do.
   */
  async setRolePermissions(role: Role, permissions: string[], actor: AuthenticatedUser): Promise<Permission[]> {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin may modify a role default permission set.');
    }
    const valid = Array.from(new Set(permissions.filter(isPermission)));

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      ...valid.map((permission) => this.prisma.rolePermission.create({ data: { role, permission } })),
    ]);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.ROLE_PERMISSIONS_UPDATED,
      entityType: 'Role',
      entityId: role,
      metadata: { role, permissions: valid },
    });

    return valid;
  }
}
