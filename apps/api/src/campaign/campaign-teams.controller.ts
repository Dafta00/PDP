import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignMembershipGuard } from './authorization/campaign-membership.guard';
import { CampaignPermissionsGuard } from './authorization/campaign-permissions.guard';
import { RequireCampaignPermissions } from './authorization/require-campaign-permissions.decorator';
import { CurrentCampaignMembership } from './authorization/current-campaign-membership.decorator';
import { CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CampaignTeamsService } from './campaign-teams.service';
import { AddTeamMemberDto, CreateCampaignTeamDto, UpdateCampaignTeamDto } from './dto/team.dto';

@Controller('campaigns/:campaignId/teams')
@UseGuards(JwtAuthGuard, CampaignMembershipGuard, CampaignPermissionsGuard)
export class CampaignTeamsController {
  constructor(private readonly campaignTeamsService: CampaignTeamsService) {}

  @Post()
  @RequireCampaignPermissions('campaign.teams.create')
  create(
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateCampaignTeamDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignTeamsService.create(campaignId, dto, user, membership);
  }

  @Get()
  @RequireCampaignPermissions('campaign.teams.view')
  findAll(@Param('campaignId') campaignId: string, @CurrentCampaignMembership() membership: CampaignMembershipLike) {
    return this.campaignTeamsService.findAll(campaignId, membership);
  }

  @Get(':id')
  @RequireCampaignPermissions('campaign.teams.view')
  findOne(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignTeamsService.findOne(campaignId, id, membership);
  }

  @Patch(':id')
  @RequireCampaignPermissions('campaign.teams.update')
  update(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignTeamDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignTeamsService.update(campaignId, id, dto, user, membership);
  }

  @Post(':id/members')
  @RequireCampaignPermissions('campaign.teams.manage')
  addMember(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignTeamsService.addMember(campaignId, id, dto, membership);
  }

  @Delete(':id/members/:memberId')
  @RequireCampaignPermissions('campaign.teams.manage')
  removeMember(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignTeamsService.removeMember(campaignId, id, memberId, membership);
  }
}
