import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CampaignEventStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignMembershipGuard } from './authorization/campaign-membership.guard';
import { CampaignPermissionsGuard } from './authorization/campaign-permissions.guard';
import { RequireCampaignPermissions } from './authorization/require-campaign-permissions.decorator';
import { CurrentCampaignMembership } from './authorization/current-campaign-membership.decorator';
import { CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CampaignEventsService } from './campaign-events.service';
import { CreateCampaignEventDto, UpdateCampaignEventDto } from './dto/event.dto';

@Controller('campaigns/:campaignId/events')
@UseGuards(JwtAuthGuard, CampaignMembershipGuard, CampaignPermissionsGuard)
export class CampaignEventsController {
  constructor(private readonly campaignEventsService: CampaignEventsService) {}

  @Post()
  @RequireCampaignPermissions('campaign.events.create')
  create(
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateCampaignEventDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignEventsService.create(campaignId, dto, user, membership);
  }

  @Get()
  @RequireCampaignPermissions('campaign.events.view')
  findAll(
    @Param('campaignId') campaignId: string,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
    @Query('status') status?: CampaignEventStatus,
  ) {
    return this.campaignEventsService.findAll(campaignId, membership, status);
  }

  @Get(':id')
  @RequireCampaignPermissions('campaign.events.view')
  findOne(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignEventsService.findOne(campaignId, id, membership);
  }

  @Patch(':id')
  @RequireCampaignPermissions('campaign.events.update')
  update(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignEventDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignEventsService.update(campaignId, id, dto, user, membership);
  }
}
