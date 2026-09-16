import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

const ADMIN_OVERSIGHT_ROLES: Role[] = [Role.SUPER_ADMIN, Role.STATE_ADMIN];

/**
 * Creating/editing the Campaign container itself (name, candidate profile,
 * dates, status) is platform configuration — gated to the ADMINISTRATIVE
 * SUPER_ADMIN/STATE_ADMIN role, the same way only they configure other
 * system-level records. Day-to-day campaign OPERATIONS (teams, events,
 * volunteers, tasks, …) are never touched here — those live entirely
 * behind CampaignAuthorizationService and a real campaign membership. An
 * administrative SUPER_ADMIN/STATE_ADMIN gets read oversight of which
 * campaigns exist, but that does not substitute for a campaign membership
 * anywhere else in this module.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateCampaignDto, actor: AuthenticatedUser) {
    if (!ADMIN_OVERSIGHT_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Only a platform administrator may create a campaign.');
    }

    const campaign = await this.prisma.campaign.create({ data: { ...dto } });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_CREATED,
      entityType: 'Campaign',
      entityId: campaign.id,
      metadata: { name: campaign.name, candidateName: campaign.candidateName },
    });

    return campaign;
  }

  /** Campaigns the actor may see: every one, if they're an administrative SUPER_ADMIN/STATE_ADMIN; otherwise only ones they hold a campaign membership on. */
  async findAll(actor: AuthenticatedUser) {
    if (ADMIN_OVERSIGHT_ROLES.includes(actor.role)) {
      return this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
    }
    return this.prisma.campaign.findMany({
      where: { memberships: { some: { userId: actor.id, status: 'ACTIVE' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found.');

    if (ADMIN_OVERSIGHT_ROLES.includes(actor.role)) return campaign;

    const membership = await this.prisma.campaignMembership.findUnique({
      where: { campaignId_userId: { campaignId: id, userId: actor.id } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('You do not have a campaign role on this campaign.');
    }
    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto, actor: AuthenticatedUser) {
    if (!ADMIN_OVERSIGHT_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Only a platform administrator may edit the campaign record.');
    }
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_UPDATED,
      entityType: 'Campaign',
      entityId: campaign.id,
    });

    return campaign;
  }
}
