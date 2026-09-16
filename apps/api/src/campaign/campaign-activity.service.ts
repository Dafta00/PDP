import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignAuthorizationService, CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CreateCampaignActivityDto } from './dto/activity.dto';

const ACTIVITY_SELECT = {
  id: true,
  campaignId: true,
  type: true,
  description: true,
  date: true,
  senatorialDistrictId: true,
  lgaId: true,
  wardId: true,
  pollingUnitId: true,
  responsibleId: true,
  responsible: { select: { id: true, user: { select: { fullName: true } } } },
  teamId: true,
  eventId: true,
  attachmentUrls: true,
  createdAt: true,
};

@Injectable()
export class CampaignActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  async create(campaignId: string, dto: CreateCampaignActivityDto, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    const scope = this.campaignAuthorization.defaultScope(dto, actorMembership);
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, scope);

    const activity = await this.prisma.campaignActivity.create({
      data: {
        campaignId,
        type: dto.type,
        description: dto.description,
        teamId: dto.teamId,
        eventId: dto.eventId,
        attachmentUrls: dto.attachmentUrls ?? [],
        responsibleId: actorMembership.id,
        senatorialDistrictId: scope.senatorialDistrictId ?? null,
        lgaId: scope.lgaId ?? null,
        wardId: scope.wardId ?? null,
        pollingUnitId: scope.pollingUnitId ?? null,
      },
      select: ACTIVITY_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_ACTIVITY_RECORDED,
      entityType: 'CampaignActivity',
      entityId: activity.id,
      metadata: { campaignId, type: dto.type },
    });

    return activity;
  }

  async findAll(campaignId: string, actorMembership: CampaignMembershipLike) {
    return this.prisma.campaignActivity.findMany({
      where: { campaignId, ...this.campaignAuthorization.scopeWhere(actorMembership) },
      select: ACTIVITY_SELECT,
      orderBy: { date: 'desc' },
      take: 100,
    });
  }
}
