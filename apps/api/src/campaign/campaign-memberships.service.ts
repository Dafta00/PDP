import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CampaignRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  CampaignAuthorizationService,
  CampaignMembershipLike,
  CampaignScope,
  canonicalCampaignScope,
  compactCampaignScope,
  humanCampaignRole,
} from './authorization/campaign-authorization.service';
import { CreateCampaignMembershipDto } from './dto/create-campaign-membership.dto';
import { UpdateCampaignMembershipDto } from './dto/update-campaign-membership.dto';

const SCOPE_REQUIREMENTS: Partial<Record<CampaignRole, 'senatorialDistrictId' | 'lgaId' | 'wardId' | 'pollingUnitId'>> = {
  [CampaignRole.DISTRICT_COORDINATOR]: 'senatorialDistrictId',
  [CampaignRole.LGA_COORDINATOR]: 'lgaId',
  [CampaignRole.WARD_COORDINATOR]: 'wardId',
  [CampaignRole.POLLING_UNIT_COORDINATOR]: 'pollingUnitId',
};

const SAFE_SELECT = {
  id: true,
  campaignId: true,
  userId: true,
  role: true,
  status: true,
  senatorialDistrictId: true,
  lgaId: true,
  wardId: true,
  pollingUnitId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, fullName: true, email: true } },
};

/**
 * Campaign "user management" — assigning/editing a user's CampaignRole and
 * campaign geography. Mirrors UsersService's hierarchy pattern exactly
 * (role authority + scope containment + self-escalation protection + audit)
 * but against CampaignAuthorizationService/CampaignRole, never against the
 * administrative Role — see the schema header on the Campaign models.
 */
@Injectable()
export class CampaignMembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  async create(campaignId: string, dto: CreateCampaignMembershipDto, actor: AuthenticatedUser) {
    const actorMembership = await this.campaignAuthorization.requireActiveMembership(actor, campaignId);

    const canonical = canonicalCampaignScope(dto.role, dto);
    this.assertScopeMatchesRole(dto.role, canonical);

    const decision = await this.campaignAuthorization.evaluateMembershipChange(actorMembership, dto.role, canonical);
    if (!decision.allowed) {
      await this.campaignAuthorization.recordMembershipDenial(actor, campaignId, decision, {
        attemptedAction: 'create',
        targetRole: dto.role,
        targetScope: canonical,
      });
      throw new ForbiddenException(decision.reason);
    }

    const existing = await this.prisma.campaignMembership.findUnique({
      where: { campaignId_userId: { campaignId, userId: dto.userId } },
    });
    if (existing) {
      throw new BadRequestException('This user already has a campaign role on this campaign.');
    }

    const membership = await this.prisma.campaignMembership.create({
      data: {
        campaignId,
        userId: dto.userId,
        role: dto.role,
        senatorialDistrictId: canonical.senatorialDistrictId ?? null,
        lgaId: canonical.lgaId ?? null,
        wardId: canonical.wardId ?? null,
        pollingUnitId: canonical.pollingUnitId ?? null,
        createdById: actor.id,
      },
      select: SAFE_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_USER_CREATED,
      entityType: 'CampaignMembership',
      entityId: membership.id,
      metadata: { campaignId, role: dto.role, scope: compactCampaignScope(canonical) },
    });

    return membership;
  }

  async findAll(campaignId: string, actor: AuthenticatedUser) {
    const actorMembership = await this.campaignAuthorization.requireActiveMembership(actor, campaignId);
    const where = { campaignId, ...this.campaignAuthorization.scopeWhere(actorMembership) };
    return this.prisma.campaignMembership.findMany({
      where,
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(campaignId: string, id: string, actor: AuthenticatedUser) {
    const actorMembership = await this.campaignAuthorization.requireActiveMembership(actor, campaignId);
    const membership = await this.prisma.campaignMembership.findUnique({ where: { id }, select: SAFE_SELECT });
    if (!membership || membership.campaignId !== campaignId) {
      throw new NotFoundException('Campaign membership not found.');
    }
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, membership);
    return membership;
  }

  async update(campaignId: string, id: string, dto: UpdateCampaignMembershipDto, actor: AuthenticatedUser) {
    const actorMembership = await this.campaignAuthorization.requireActiveMembership(actor, campaignId);

    const existing = await this.prisma.campaignMembership.findUnique({ where: { id } });
    if (!existing || existing.campaignId !== campaignId) {
      throw new NotFoundException('Campaign membership not found.');
    }

    const wantsPrivilegeChange =
      dto.role !== undefined ||
      dto.status !== undefined ||
      dto.senatorialDistrictId !== undefined ||
      dto.lgaId !== undefined ||
      dto.wardId !== undefined ||
      dto.pollingUnitId !== undefined;

    if (existing.userId === actor.id) {
      if (wantsPrivilegeChange) {
        await this.campaignAuthorization.recordSelfEscalationAttempt(actor, campaignId);
        throw new ForbiddenException('You cannot change your own campaign role, status, or geographic scope.');
      }
      return this.prisma.campaignMembership.findUniqueOrThrow({ where: { id }, select: SAFE_SELECT });
    }

    const currentDecision = await this.campaignAuthorization.evaluateMembershipChange(
      actorMembership,
      existing.role,
      existing,
    );
    if (!currentDecision.allowed) {
      await this.campaignAuthorization.recordMembershipDenial(actor, campaignId, currentDecision, {
        attemptedAction: 'update',
        targetRole: existing.role,
        targetScope: existing,
        targetUserId: id,
      });
      throw new ForbiddenException(currentDecision.reason);
    }

    const nextRole = dto.role ?? existing.role;
    const rawNextScope: CampaignScope = {
      senatorialDistrictId: dto.senatorialDistrictId ?? existing.senatorialDistrictId ?? undefined,
      lgaId: dto.lgaId ?? existing.lgaId ?? undefined,
      wardId: dto.wardId ?? existing.wardId ?? undefined,
      pollingUnitId: dto.pollingUnitId ?? existing.pollingUnitId ?? undefined,
    };
    const nextScope = canonicalCampaignScope(nextRole, rawNextScope);
    this.assertScopeMatchesRole(nextRole, nextScope);

    const nextDecision = await this.campaignAuthorization.evaluateMembershipChange(actorMembership, nextRole, nextScope);
    if (!nextDecision.allowed) {
      await this.campaignAuthorization.recordMembershipDenial(actor, campaignId, nextDecision, {
        attemptedAction: 'update',
        targetRole: nextRole,
        targetScope: nextScope,
        targetUserId: id,
      });
      throw new ForbiddenException(nextDecision.reason);
    }

    const touchesRoleOrScope =
      dto.role !== undefined ||
      dto.senatorialDistrictId !== undefined ||
      dto.lgaId !== undefined ||
      dto.wardId !== undefined ||
      dto.pollingUnitId !== undefined;

    const membership = await this.prisma.campaignMembership.update({
      where: { id },
      data: {
        status: dto.status,
        ...(touchesRoleOrScope
          ? {
              role: nextRole,
              senatorialDistrictId: nextScope.senatorialDistrictId ?? null,
              lgaId: nextScope.lgaId ?? null,
              wardId: nextScope.wardId ?? null,
              pollingUnitId: nextScope.pollingUnitId ?? null,
            }
          : {}),
      },
      select: SAFE_SELECT,
    });

    if (dto.role && dto.role !== existing.role) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.CAMPAIGN_ROLE_ASSIGNED,
        entityType: 'CampaignMembership',
        entityId: id,
        metadata: { campaignId, from: existing.role, to: dto.role },
      });
    }
    if (touchesRoleOrScope) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.CAMPAIGN_SCOPE_ASSIGNED,
        entityType: 'CampaignMembership',
        entityId: id,
        metadata: {
          campaignId,
          from: compactCampaignScope(existing),
          to: compactCampaignScope(nextScope),
        },
      });
    }
    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_USER_UPDATED,
      entityType: 'CampaignMembership',
      entityId: id,
      metadata: { campaignId },
    });

    return membership;
  }

  private assertScopeMatchesRole(role: CampaignRole, target: CampaignScope) {
    const requiredField = SCOPE_REQUIREMENTS[role];
    if (requiredField && !target[requiredField]) {
      throw new BadRequestException(
        `A ${humanCampaignRole(role)} must be assigned a ${requiredField.replace('Id', '')}.`,
      );
    }
  }
}
