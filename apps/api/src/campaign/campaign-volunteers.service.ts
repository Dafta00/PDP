import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignAuthorizationService, CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CreateCampaignVolunteerDto, UpdateCampaignVolunteerDto } from './dto/volunteer.dto';

const VOLUNTEER_SELECT = {
  id: true,
  campaignId: true,
  memberId: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  availability: true,
  senatorialDistrictId: true,
  lgaId: true,
  wardId: true,
  pollingUnitId: true,
  coordinatorId: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class CampaignVolunteersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  async create(campaignId: string, dto: CreateCampaignVolunteerDto, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    const scope = this.campaignAuthorization.defaultScope(dto, actorMembership);
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, scope);

    const volunteer = await this.prisma.campaignVolunteer.create({
      data: {
        campaignId,
        fullName: dto.fullName,
        phone: dto.phone,
        role: dto.role,
        availability: dto.availability,
        memberId: dto.memberId,
        coordinatorId: dto.coordinatorId ?? actorMembership.id,
        senatorialDistrictId: scope.senatorialDistrictId ?? null,
        lgaId: scope.lgaId ?? null,
        wardId: scope.wardId ?? null,
        pollingUnitId: scope.pollingUnitId ?? null,
      },
      select: VOLUNTEER_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_VOLUNTEER_CREATED,
      entityType: 'CampaignVolunteer',
      entityId: volunteer.id,
      metadata: { campaignId },
    });

    return volunteer;
  }

  async findAll(campaignId: string, actorMembership: CampaignMembershipLike) {
    return this.prisma.campaignVolunteer.findMany({
      where: { campaignId, ...this.campaignAuthorization.scopeWhere(actorMembership) },
      select: VOLUNTEER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(campaignId: string, id: string, actorMembership: CampaignMembershipLike) {
    const volunteer = await this.prisma.campaignVolunteer.findUnique({ where: { id }, select: VOLUNTEER_SELECT });
    if (!volunteer || volunteer.campaignId !== campaignId) throw new NotFoundException('Campaign volunteer not found.');
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, volunteer);
    return volunteer;
  }

  async update(campaignId: string, id: string, dto: UpdateCampaignVolunteerDto, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    const existing = await this.prisma.campaignVolunteer.findUnique({ where: { id } });
    if (!existing || existing.campaignId !== campaignId) throw new NotFoundException('Campaign volunteer not found.');
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, existing);

    const touchesScope =
      dto.senatorialDistrictId !== undefined || dto.lgaId !== undefined || dto.wardId !== undefined || dto.pollingUnitId !== undefined;
    let scopeUpdate = {};
    if (touchesScope) {
      const nextScope = this.campaignAuthorization.defaultScope(dto, actorMembership);
      await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, nextScope);
      scopeUpdate = {
        senatorialDistrictId: nextScope.senatorialDistrictId ?? null,
        lgaId: nextScope.lgaId ?? null,
        wardId: nextScope.wardId ?? null,
        pollingUnitId: nextScope.pollingUnitId ?? null,
      };
    }

    const volunteer = await this.prisma.campaignVolunteer.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        role: dto.role,
        availability: dto.availability,
        status: dto.status,
        coordinatorId: dto.coordinatorId,
        ...scopeUpdate,
      },
      select: VOLUNTEER_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_VOLUNTEER_UPDATED,
      entityType: 'CampaignVolunteer',
      entityId: id,
      metadata: { campaignId },
    });

    return volunteer;
  }
}
