import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignAuthorizationService, CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CreateCampaignTaskDto, UpdateCampaignTaskDto } from './dto/task.dto';

const TASK_SELECT = {
  id: true,
  campaignId: true,
  title: true,
  description: true,
  assignedToMembershipId: true,
  assignedToMembership: { select: { id: true, user: { select: { fullName: true } } } },
  assignedToTeamId: true,
  assignedToTeam: { select: { id: true, name: true } },
  eventId: true,
  senatorialDistrictId: true,
  lgaId: true,
  wardId: true,
  pollingUnitId: true,
  priority: true,
  dueDate: true,
  status: true,
  createdById: true,
  completedById: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class CampaignTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  async create(campaignId: string, dto: CreateCampaignTaskDto, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    const scope = this.campaignAuthorization.defaultScope(dto, actorMembership);
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, scope);

    const task = await this.prisma.campaignTask.create({
      data: {
        campaignId,
        title: dto.title,
        description: dto.description,
        assignedToMembershipId: dto.assignedToMembershipId,
        assignedToTeamId: dto.assignedToTeamId,
        eventId: dto.eventId,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        createdById: actorMembership.id,
        senatorialDistrictId: scope.senatorialDistrictId ?? null,
        lgaId: scope.lgaId ?? null,
        wardId: scope.wardId ?? null,
        pollingUnitId: scope.pollingUnitId ?? null,
      },
      select: TASK_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: dto.assignedToMembershipId || dto.assignedToTeamId ? AuditAction.CAMPAIGN_TASK_ASSIGNED : AuditAction.CAMPAIGN_TASK_CREATED,
      entityType: 'CampaignTask',
      entityId: task.id,
      metadata: { campaignId },
    });

    return task;
  }

  async findAll(campaignId: string, actorMembership: CampaignMembershipLike) {
    return this.prisma.campaignTask.findMany({
      where: { campaignId, ...this.campaignAuthorization.scopeWhere(actorMembership) },
      select: TASK_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(campaignId: string, id: string, actorMembership: CampaignMembershipLike) {
    const task = await this.prisma.campaignTask.findUnique({ where: { id }, select: TASK_SELECT });
    if (!task || task.campaignId !== campaignId) throw new NotFoundException('Campaign task not found.');
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, task);
    return task;
  }

  async update(campaignId: string, id: string, dto: UpdateCampaignTaskDto, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    const existing = await this.prisma.campaignTask.findUnique({ where: { id } });
    if (!existing || existing.campaignId !== campaignId) throw new NotFoundException('Campaign task not found.');
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

    const isCompleting = dto.status === 'COMPLETED' && existing.status !== 'COMPLETED';

    const task = await this.prisma.campaignTask.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        assignedToMembershipId: dto.assignedToMembershipId,
        assignedToTeamId: dto.assignedToTeamId,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        ...(isCompleting ? { completedById: actorMembership.id, completedAt: new Date() } : {}),
        ...scopeUpdate,
      },
      select: TASK_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: isCompleting ? AuditAction.CAMPAIGN_TASK_COMPLETED : AuditAction.CAMPAIGN_TASK_UPDATED,
      entityType: 'CampaignTask',
      entityId: id,
      metadata: { campaignId },
    });

    if (isCompleting) {
      await this.prisma.campaignActivity.create({
        data: {
          campaignId,
          type: 'TASK_COMPLETED',
          description: `${task.title} was completed.`,
          responsibleId: actorMembership.id,
          senatorialDistrictId: task.senatorialDistrictId,
          lgaId: task.lgaId,
          wardId: task.wardId,
          pollingUnitId: task.pollingUnitId,
        },
      });
    }

    return task;
  }
}
