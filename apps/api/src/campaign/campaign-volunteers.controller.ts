import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignMembershipGuard } from './authorization/campaign-membership.guard';
import { CampaignPermissionsGuard } from './authorization/campaign-permissions.guard';
import { RequireCampaignPermissions } from './authorization/require-campaign-permissions.decorator';
import { CurrentCampaignMembership } from './authorization/current-campaign-membership.decorator';
import { CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CampaignVolunteersService } from './campaign-volunteers.service';
import { CreateCampaignVolunteerDto, UpdateCampaignVolunteerDto } from './dto/volunteer.dto';

@Controller('campaigns/:campaignId/volunteers')
@UseGuards(JwtAuthGuard, CampaignMembershipGuard, CampaignPermissionsGuard)
export class CampaignVolunteersController {
  constructor(private readonly campaignVolunteersService: CampaignVolunteersService) {}

  @Post()
  @RequireCampaignPermissions('campaign.volunteers.create')
  create(
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateCampaignVolunteerDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignVolunteersService.create(campaignId, dto, user, membership);
  }

  @Get()
  @RequireCampaignPermissions('campaign.volunteers.view')
  findAll(@Param('campaignId') campaignId: string, @CurrentCampaignMembership() membership: CampaignMembershipLike) {
    return this.campaignVolunteersService.findAll(campaignId, membership);
  }

  @Get(':id')
  @RequireCampaignPermissions('campaign.volunteers.view')
  findOne(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignVolunteersService.findOne(campaignId, id, membership);
  }

  @Patch(':id')
  @RequireCampaignPermissions('campaign.volunteers.update')
  update(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignVolunteerDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignVolunteersService.update(campaignId, id, dto, user, membership);
  }
}
