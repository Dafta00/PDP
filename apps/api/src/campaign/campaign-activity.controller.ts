import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignMembershipGuard } from './authorization/campaign-membership.guard';
import { CampaignPermissionsGuard } from './authorization/campaign-permissions.guard';
import { RequireCampaignPermissions } from './authorization/require-campaign-permissions.decorator';
import { CurrentCampaignMembership } from './authorization/current-campaign-membership.decorator';
import { CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CampaignActivityService } from './campaign-activity.service';
import { CreateCampaignActivityDto } from './dto/activity.dto';

@Controller('campaigns/:campaignId/activity')
@UseGuards(JwtAuthGuard, CampaignMembershipGuard, CampaignPermissionsGuard)
export class CampaignActivityController {
  constructor(private readonly campaignActivityService: CampaignActivityService) {}

  @Post()
  @RequireCampaignPermissions('campaign.activity.create')
  create(
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateCampaignActivityDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignActivityService.create(campaignId, dto, user, membership);
  }

  @Get()
  @RequireCampaignPermissions('campaign.activity.view')
  findAll(@Param('campaignId') campaignId: string, @CurrentCampaignMembership() membership: CampaignMembershipLike) {
    return this.campaignActivityService.findAll(campaignId, membership);
  }
}
