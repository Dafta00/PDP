import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignAuthorizationService, CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { AddTeamMemberDto, CreateCampaignTeamDto, UpdateCampaignTeamDto } from './dto/team.dto';

const TEAM_SELECT = {
  id: true,
  campaignId: true,
  name: true,
  teamType: true,
  status: true,
  senatorialDistrictId: true,
  lgaId: true,
  wardId: true,
  pollingUnitId: true,
  coordinatorId: true,
  coordinator: { select: { id: true, user: { select: { fullName: true } } } },
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true } },
};

@Injectable()
export class CampaignTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  async create(campaignId: string, dto: CreateCampaignTeamDto, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    const scope = this.campaignAuthorization.defaultScope(dto, actorMembership);
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, scope);

    const team = await this.prisma.campaignTeam.create({
      data: {
        campaignId,
        name: dto.name,
        teamType: dto.teamType,
        coordinatorId: dto.coordinatorId,
        senatorialDistrictId: scope.senatorialDistrictId ?? null,
        lgaId: scope.lgaId ?? null,
        wardId: scope.wardId ?? null,
        pollingUnitId: scope.pollingUnitId ?? null,
      },
      select: TEAM_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_TEAM_CREATED,
      entityType: 'CampaignTeam',
      entityId: team.id,
      metadata: { campaignId },
    });

    return team;
  }

  async findAll(campaignId: string, actorMembership: CampaignMembershipLike) {
    return this.prisma.campaignTeam.findMany({
      where: { campaignId, ...this.campaignAuthorization.scopeWhere(actorMembership) },
      select: TEAM_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(campaignId: string, id: string, actorMembership: CampaignMembershipLike) {
    const team = await this.prisma.campaignTeam.findUnique({
      where: { id },
      select: { ...TEAM_SELECT, members: { include: { membership: { select: { id: true, user: { select: { fullName: true } } } }, volunteer: { select: { id: true, fullName: true } } } } },
    });
    if (!team || team.campaignId !== campaignId) throw new NotFoundException('Campaign team not found.');
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, team);
    return team;
  }

  async update(campaignId: string, id: string, dto: UpdateCampaignTeamDto, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    const existing = await this.prisma.campaignTeam.findUnique({ where: { id } });
    if (!existing || existing.campaignId !== campaignId) throw new NotFoundException('Campaign team not found.');
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

    const team = await this.prisma.campaignTeam.update({
      where: { id },
      data: {
        name: dto.name,
        teamType: dto.teamType,
        status: dto.status,
        coordinatorId: dto.coordinatorId,
        ...scopeUpdate,
      },
      select: TEAM_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_TEAM_UPDATED,
      entityType: 'CampaignTeam',
      entityId: id,
      metadata: { campaignId },
    });

    return team;
  }

  async addMember(campaignId: string, teamId: string, dto: AddTeamMemberDto, actorMembership: CampaignMembershipLike) {
    if (!dto.membershipId && !dto.volunteerId) {
      throw new BadRequestException('Specify either membershipId or volunteerId.');
    }
    if (dto.membershipId && dto.volunteerId) {
      throw new BadRequestException('Specify only one of membershipId or volunteerId.');
    }
    const team = await this.prisma.campaignTeam.findUnique({ where: { id: teamId } });
    if (!team || team.campaignId !== campaignId) throw new NotFoundException('Campaign team not found.');
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, team);

    return this.prisma.campaignTeamMember.create({
      data: { teamId, membershipId: dto.membershipId, volunteerId: dto.volunteerId, roleInTeam: dto.roleInTeam },
    });
  }

  async removeMember(campaignId: string, teamId: string, memberId: string, actorMembership: CampaignMembershipLike) {
    const team = await this.prisma.campaignTeam.findUnique({ where: { id: teamId } });
    if (!team || team.campaignId !== campaignId) throw new NotFoundException('Campaign team not found.');
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, team);

    const member = await this.prisma.campaignTeamMember.findUnique({ where: { id: memberId } });
    if (!member || member.teamId !== teamId) throw new NotFoundException('Team member not found.');
    await this.prisma.campaignTeamMember.delete({ where: { id: memberId } });
  }
}
