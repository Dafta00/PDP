import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignMembershipGuard } from './authorization/campaign-membership.guard';
import { CampaignPermissionsGuard } from './authorization/campaign-permissions.guard';
import { RequireCampaignPermissions } from './authorization/require-campaign-permissions.decorator';
import { CurrentCampaignMembership } from './authorization/current-campaign-membership.decorator';
import { CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CampaignTasksService } from './campaign-tasks.service';
import { CreateCampaignTaskDto, UpdateCampaignTaskDto } from './dto/task.dto';

@Controller('campaigns/:campaignId/tasks')
@UseGuards(JwtAuthGuard, CampaignMembershipGuard, CampaignPermissionsGuard)
export class CampaignTasksController {
  constructor(private readonly campaignTasksService: CampaignTasksService) {}

  @Post()
  @RequireCampaignPermissions('campaign.tasks.create')
  create(
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateCampaignTaskDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignTasksService.create(campaignId, dto, user, membership);
  }

  @Get()
  @RequireCampaignPermissions('campaign.tasks.view')
  findAll(@Param('campaignId') campaignId: string, @CurrentCampaignMembership() membership: CampaignMembershipLike) {
    return this.campaignTasksService.findAll(campaignId, membership);
  }

  @Get(':id')
  @RequireCampaignPermissions('campaign.tasks.view')
  findOne(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignTasksService.findOne(campaignId, id, membership);
  }

  @Patch(':id')
  @RequireCampaignPermissions('campaign.tasks.update')
  update(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignTaskDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignTasksService.update(campaignId, id, dto, user, membership);
  }

  @Patch(':id/complete')
  @RequireCampaignPermissions('campaign.tasks.complete')
  complete(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignTasksService.update(campaignId, id, { status: 'COMPLETED' } as UpdateCampaignTaskDto, user, membership);
  }
}
