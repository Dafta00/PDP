import { Injectable, NotFoundException } from '@nestjs/common';
import { CampaignEventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignAuthorizationService, CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CreateCampaignEventDto, UpdateCampaignEventDto } from './dto/event.dto';

const EVENT_SELECT = {
  id: true,
  campaignId: true,
  title: true,
  type: true,
  description: true,
  date: true,
  startTime: true,
  endTime: true,
  venue: true,
  senatorialDistrictId: true,
  lgaId: true,
  wardId: true,
  pollingUnitId: true,
  organizerId: true,
  organizer: { select: { id: true, user: { select: { fullName: true } } } },
  expectedAttendance: true,
  actualAttendance: true,
  status: true,
  attachmentUrls: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { attendances: true, tasks: true } },
};

@Injectable()
export class CampaignEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  async create(campaignId: string, dto: CreateCampaignEventDto, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    const scope = this.campaignAuthorization.defaultScope(dto, actorMembership);
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, scope);

    const event = await this.prisma.campaignEvent.create({
      data: {
        campaignId,
        title: dto.title,
        type: dto.type,
        description: dto.description,
        date: new Date(dto.date),
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        venue: dto.venue,
        expectedAttendance: dto.expectedAttendance,
        attachmentUrls: dto.attachmentUrls ?? [],
        organizerId: actorMembership.id,
        senatorialDistrictId: scope.senatorialDistrictId ?? null,
        lgaId: scope.lgaId ?? null,
        wardId: scope.wardId ?? null,
        pollingUnitId: scope.pollingUnitId ?? null,
      },
      select: EVENT_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_EVENT_CREATED,
      entityType: 'CampaignEvent',
      entityId: event.id,
      metadata: { campaignId, type: event.type },
    });

    return event;
  }

  async findAll(campaignId: string, actorMembership: CampaignMembershipLike, status?: CampaignEventStatus) {
    return this.prisma.campaignEvent.findMany({
      where: {
        campaignId,
        ...(status ? { status } : {}),
        ...this.campaignAuthorization.scopeWhere(actorMembership),
      },
      select: EVENT_SELECT,
      orderBy: { date: 'desc' },
    });
  }

  async findOne(campaignId: string, id: string, actorMembership: CampaignMembershipLike) {
    const event = await this.prisma.campaignEvent.findUnique({ where: { id }, select: EVENT_SELECT });
    if (!event || event.campaignId !== campaignId) throw new NotFoundException('Campaign event not found.');
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, event);
    return event;
  }

  async update(campaignId: string, id: string, dto: UpdateCampaignEventDto, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    const existing = await this.prisma.campaignEvent.findUnique({ where: { id } });
    if (!existing || existing.campaignId !== campaignId) throw new NotFoundException('Campaign event not found.');
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

    const event = await this.prisma.campaignEvent.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : undefined,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        venue: dto.venue,
        expectedAttendance: dto.expectedAttendance,
        actualAttendance: dto.actualAttendance,
        status: dto.status,
        attachmentUrls: dto.attachmentUrls,
        ...scopeUpdate,
      },
      select: EVENT_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_EVENT_UPDATED,
      entityType: 'CampaignEvent',
      entityId: id,
      metadata: { campaignId },
    });

    // A curated operational-activity entry — separate from the audit trail
    // above — is recorded when an event is marked completed, per spec
    // section 15.
    if (dto.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      await this.prisma.campaignActivity.create({
        data: {
          campaignId,
          type: 'EVENT_COMPLETED',
          description: `${event.title} was completed.`,
          eventId: event.id,
          responsibleId: actorMembership.id,
          senatorialDistrictId: event.senatorialDistrictId,
          lgaId: event.lgaId,
          wardId: event.wardId,
          pollingUnitId: event.pollingUnitId,
        },
      });
    }

    return event;
  }
}
