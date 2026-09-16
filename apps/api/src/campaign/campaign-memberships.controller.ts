import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignMembershipGuard } from './authorization/campaign-membership.guard';
import { CampaignPermissionsGuard } from './authorization/campaign-permissions.guard';
import { RequireCampaignPermissions } from './authorization/require-campaign-permissions.decorator';
import { CampaignMembershipsService } from './campaign-memberships.service';
import { CreateCampaignMembershipDto } from './dto/create-campaign-membership.dto';
import { UpdateCampaignMembershipDto } from './dto/update-campaign-membership.dto';

@Controller('campaigns/:campaignId/users')
@UseGuards(JwtAuthGuard, CampaignMembershipGuard, CampaignPermissionsGuard)
export class CampaignMembershipsController {
  constructor(private readonly campaignMembershipsService: CampaignMembershipsService) {}

  @Post()
  @RequireCampaignPermissions('campaign.users.create')
  create(
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateCampaignMembershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignMembershipsService.create(campaignId, dto, user);
  }

  @Get()
  @RequireCampaignPermissions('campaign.users.view')
  findAll(@Param('campaignId') campaignId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignMembershipsService.findAll(campaignId, user);
  }

  @Get(':id')
  @RequireCampaignPermissions('campaign.users.view')
  findOne(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignMembershipsService.findOne(campaignId, id, user);
  }

  @Patch(':id')
  @RequireCampaignPermissions('campaign.users.update')
  update(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignMembershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignMembershipsService.update(campaignId, id, dto, user);
  }
}
