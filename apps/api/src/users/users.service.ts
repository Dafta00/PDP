import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import {
  AuthorizationService,
  canonicalScope,
  compactScope,
  humanRole,
  TargetScope,
} from '../common/authorization/authorization.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SCOPE_REQUIREMENTS: Partial<Record<Role, 'senatorialDistrictId' | 'lgaId' | 'wardId' | 'pollingUnitId'>> = {
  [Role.SENATORIAL_ADMIN]: 'senatorialDistrictId',
  [Role.LGA_ADMIN]: 'lgaId',
  [Role.WARD_ADMIN]: 'wardId',
  [Role.POLLING_UNIT_OFFICER]: 'pollingUnitId',
};

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  senatorialDistrictId: true,
  lgaId: true,
  wardId: true,
  pollingUnitId: true,
  canCreateUsers: true,
  createdById: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authorization: AuthorizationService,
  ) {}

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const canonical = canonicalScope(dto.role, dto);
    this.assertScopeMatchesRole(dto.role, canonical);

    const decision = await this.authorization.canCreateUser(actor, dto.role, canonical);
    if (!decision.allowed) throw new ForbiddenException(decision.reason);

    // Only a SUPER_ADMIN may grant the (off-by-default) permission that lets
    // a POLLING_UNIT_OFFICER create DATA_ENTRY_OFFICER accounts — a lower
    // admin creating a PU officer can never switch this on for them.
    const canCreateUsers =
      actor.role === Role.SUPER_ADMIN && dto.role === Role.POLLING_UNIT_OFFICER ? (dto.canCreateUsers ?? false) : false;

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        senatorialDistrictId: canonical.senatorialDistrictId ?? null,
        lgaId: canonical.lgaId ?? null,
        wardId: canonical.wardId ?? null,
        pollingUnitId: canonical.pollingUnitId ?? null,
        canCreateUsers,
        createdById: actor.id,
      },
      select: SAFE_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_CREATED,
      entityType: 'User',
      entityId: user.id,
      metadata: {
        role: user.role,
        email: user.email,
        scope: compactScope(canonical),
        actorRole: actor.role,
        actorScope: compactScope(actor),
      },
    });

    return user;
  }

  async findAll(params: { skip: number; take: number }, actor: AuthenticatedUser) {
    const where = this.visibilityWhere(actor);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          ...SAFE_SELECT,
          senatorialDistrict: { select: { name: true } },
          lga: { select: { name: true } },
          ward: { select: { name: true } },
          pollingUnit: { select: { name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        ...SAFE_SELECT,
        createdBy: { select: { id: true, fullName: true, email: true } },
        senatorialDistrict: { select: { name: true } },
        lga: { select: { name: true } },
        ward: { select: { name: true } },
        pollingUnit: { select: { name: true } },
        additionalScopes: {
          select: {
            id: true,
            senatorialDistrictId: true,
            lgaId: true,
            wardId: true,
            pollingUnitId: true,
            createdAt: true,
            senatorialDistrict: { select: { name: true } },
            lga: { select: { name: true } },
            ward: { select: { name: true } },
            pollingUnit: { select: { name: true } },
          },
        },
        permissionGrants: { select: { permission: true, effect: true, createdAt: true } },
      },
    });

    // Same visibility rule as the list endpoint — you can't fetch by id what
    // you couldn't otherwise see in your own scope, self excepted.
    if (id !== actor.id) {
      const visible = await this.prisma.user.findFirst({ where: { id, ...this.visibilityWhere(actor) } });
      if (!visible) throw new ForbiddenException('This account is outside your assigned organizational scope.');
    }

    const permissions = Array.from(await this.authorization.getEffectivePermissions(user)).sort();
    return { ...user, permissions };
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    const wantsPrivilegeChange =
      dto.role !== undefined ||
      dto.status !== undefined ||
      dto.senatorialDistrictId !== undefined ||
      dto.lgaId !== undefined ||
      dto.wardId !== undefined ||
      dto.pollingUnitId !== undefined;

    // Self-escalation protection: no one — not even SUPER_ADMIN — may change
    // their own role, status, or geographic scope through this endpoint.
    // A self-edit may only touch their own name; everything else is denied
    // outright, regardless of what the change would actually have been.
    if (id === actor.id) {
      if (wantsPrivilegeChange) {
        await this.authorization.recordSelfEscalationAttempt(actor);
        throw new ForbiddenException('You cannot change your own role, status, or geographic scope.');
      }

      const user = await this.prisma.user.update({
        where: { id },
        data: { fullName: dto.fullName },
        select: SAFE_SELECT,
      });
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.USER_UPDATED,
        entityType: 'User',
        entityId: user.id,
      });
      return user;
    }

    // The actor must already be authorized to manage the target's CURRENT
    // role/scope before touching anything about them.
    const currentDecision = await this.authorization.canUpdateUser(actor, id, existing.role, existing);
    if (!currentDecision.allowed) throw new ForbiddenException(currentDecision.reason);

    const nextRole = dto.role ?? existing.role;
    const rawNextScope: TargetScope = {
      senatorialDistrictId: dto.senatorialDistrictId ?? existing.senatorialDistrictId ?? undefined,
      lgaId: dto.lgaId ?? existing.lgaId ?? undefined,
      wardId: dto.wardId ?? existing.wardId ?? undefined,
      pollingUnitId: dto.pollingUnitId ?? existing.pollingUnitId ?? undefined,
    };
    const nextScope = canonicalScope(nextRole, rawNextScope);
    this.assertScopeMatchesRole(nextRole, nextScope);
    // ...and authorized to manage the resulting role/scope after the change.
    const nextDecision = await this.authorization.canUpdateUser(actor, id, nextRole, nextScope);
    if (!nextDecision.allowed) throw new ForbiddenException(nextDecision.reason);

    const touchesRoleOrScope =
      dto.role !== undefined ||
      dto.senatorialDistrictId !== undefined ||
      dto.lgaId !== undefined ||
      dto.wardId !== undefined ||
      dto.pollingUnitId !== undefined;

    const data: Prisma.UserUncheckedUpdateInput = {
      fullName: dto.fullName,
      status: dto.status,
    };
    if (touchesRoleOrScope) {
      data.role = nextRole;
      data.senatorialDistrictId = nextScope.senatorialDistrictId ?? null;
      data.lgaId = nextScope.lgaId ?? null;
      data.wardId = nextScope.wardId ?? null;
      data.pollingUnitId = nextScope.pollingUnitId ?? null;
      // Demoting/moving a PU officer out of the role (or out of scope)
      // always revokes the grant; it's never carried over implicitly.
      if (nextRole !== Role.POLLING_UNIT_OFFICER) {
        data.canCreateUsers = false;
      }
    }
    if (actor.role === Role.SUPER_ADMIN && dto.canCreateUsers !== undefined) {
      data.canCreateUsers = nextRole === Role.POLLING_UNIT_OFFICER ? dto.canCreateUsers : false;
    }

    const user = await this.prisma.user.update({ where: { id }, data, select: SAFE_SELECT });

    if (dto.role && dto.role !== existing.role) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.USER_ROLE_CHANGED,
        entityType: 'User',
        entityId: user.id,
        metadata: { actorRole: actor.role, actorScope: compactScope(actor), from: existing.role, to: dto.role },
      });
    }
    if (dto.status && dto.status !== existing.status) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.USER_STATUS_CHANGED,
        entityType: 'User',
        entityId: user.id,
        metadata: { from: existing.status, to: dto.status },
      });
    }
    if (
      touchesRoleOrScope &&
      (compactScope(nextScope).senatorialDistrictId !== compactScope(existing).senatorialDistrictId ||
        compactScope(nextScope).lgaId !== compactScope(existing).lgaId ||
        compactScope(nextScope).wardId !== compactScope(existing).wardId ||
        compactScope(nextScope).pollingUnitId !== compactScope(existing).pollingUnitId)
    ) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.USER_SCOPE_CHANGED,
        entityType: 'User',
        entityId: user.id,
        metadata: { actorRole: actor.role, from: compactScope(existing), to: compactScope(nextScope) },
      });
    }
    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_UPDATED,
      entityType: 'User',
      entityId: user.id,
    });

    return user;
  }

  /** SUPER_ADMIN-only: grant an additional geographic scope to a user (e.g. a second LGA for a multi-LGA LGA_ADMIN). */
  async addScope(userId: string, target: TargetScope, actor: AuthenticatedUser) {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin may assign additional geographic scopes.');
    }
    const compact = compactScope(target);
    const fields = Object.keys(compact);
    if (fields.length !== 1) {
      throw new BadRequestException('Specify exactly one organizational unit for the additional scope.');
    }

    const row = await this.prisma.userScope.create({
      data: { userId, ...compact, createdById: actor.id },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_SCOPE_CHANGED,
      entityType: 'User',
      entityId: userId,
      metadata: { actorRole: actor.role, added: compact },
    });

    return row;
  }

  /** SUPER_ADMIN-only: revoke a previously granted additional scope. */
  async removeScope(userId: string, scopeId: string, actor: AuthenticatedUser) {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin may remove additional geographic scopes.');
    }
    const row = await this.prisma.userScope.findUniqueOrThrow({ where: { id: scopeId } });
    if (row.userId !== userId) throw new BadRequestException('That scope does not belong to this user.');

    await this.prisma.userScope.delete({ where: { id: scopeId } });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_SCOPE_CHANGED,
      entityType: 'User',
      entityId: userId,
      metadata: {
        actorRole: actor.role,
        removed: compactScope({
          senatorialDistrictId: row.senatorialDistrictId,
          lgaId: row.lgaId,
          wardId: row.wardId,
          pollingUnitId: row.pollingUnitId,
        }),
      },
    });
  }

  /**
   * Grant or revoke a single permission override for a user. The actor must
   * both possess the permission themselves and be authorized to delegate it
   * (AuthorizationService.canGrantPermission) — and, unless they're
   * SUPER_ADMIN, must already be authorized to manage the target user at
   * all (same hierarchy/scope rule as any other user-management action).
   */
  async setPermission(userId: string, permission: string, grant: boolean, actor: AuthenticatedUser) {
    if (!(await this.authorization.canGrantPermission(actor, permission))) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.USER_MANAGEMENT_DENIED,
        entityType: 'User',
        entityId: userId,
        metadata: {
          actorRole: actor.role,
          attemptedAction: 'grant-permission',
          reasonCode: 'PERMISSION_NOT_DELEGABLE',
          permission,
        },
      });
      throw new ForbiddenException('You cannot grant a permission you do not possess or are not authorized to delegate.');
    }

    if (actor.role !== Role.SUPER_ADMIN) {
      const target = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const decision = await this.authorization.canUpdateUser(actor, userId, target.role, target);
      if (!decision.allowed) throw new ForbiddenException(decision.reason);
    }

    await this.prisma.userPermission.upsert({
      where: { userId_permission: { userId, permission } },
      create: { userId, permission, effect: grant ? 'GRANT' : 'REVOKE', grantedById: actor.id },
      update: { effect: grant ? 'GRANT' : 'REVOKE', grantedById: actor.id },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: grant ? AuditAction.PERMISSION_GRANTED : AuditAction.PERMISSION_REVOKED,
      entityType: 'User',
      entityId: userId,
      metadata: { actorRole: actor.role, permission },
    });
  }

  async removePermissionOverride(userId: string, permission: string, actor: AuthenticatedUser) {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin may remove a permission override.');
    }
    await this.prisma.userPermission.deleteMany({ where: { userId, permission } });
    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.PERMISSION_REVOKED,
      entityType: 'User',
      entityId: userId,
      metadata: { actorRole: actor.role, permission, cleared: true },
    });
  }

  private assertScopeMatchesRole(role: Role, target: TargetScope) {
    const requiredField = SCOPE_REQUIREMENTS[role];
    if (requiredField && !target[requiredField]) {
      throw new BadRequestException(`A ${humanRole(role)} must be assigned a ${requiredField.replace('Id', '')}.`);
    }
  }

  /** A user list/search filter restricting results to the actor's own organizational scope — used by findAll/findOne. */
  private visibilityWhere(actor: AuthenticatedUser): Prisma.UserWhereInput {
    if (actor.role === Role.SUPER_ADMIN || actor.role === Role.STATE_ADMIN) return {};

    const scopeField =
      actor.role === Role.SENATORIAL_ADMIN
        ? ('senatorialDistrictId' as const)
        : actor.role === Role.LGA_ADMIN
          ? ('lgaId' as const)
          : actor.role === Role.WARD_ADMIN
            ? ('wardId' as const)
            : actor.role === Role.POLLING_UNIT_OFFICER
              ? ('pollingUnitId' as const)
              : null;
    if (!scopeField || !actor[scopeField]) return { id: '__no_access__' };
    const id = actor[scopeField] as string;

    switch (scopeField) {
      case 'senatorialDistrictId':
        return {
          OR: [
            { senatorialDistrictId: id },
            { lga: { senatorialDistrictId: id } },
            { ward: { lga: { senatorialDistrictId: id } } },
            { pollingUnit: { ward: { lga: { senatorialDistrictId: id } } } },
          ],
        };
      case 'lgaId':
        return { OR: [{ lgaId: id }, { ward: { lgaId: id } }, { pollingUnit: { ward: { lgaId: id } } }] };
      case 'wardId':
        return { OR: [{ wardId: id }, { pollingUnit: { wardId: id } }] };
      case 'pollingUnitId':
        return { pollingUnitId: id };
    }
  }
}
