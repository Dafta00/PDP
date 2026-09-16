import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignMembershipGuard } from './authorization/campaign-membership.guard';
import { CampaignPermissionsGuard } from './authorization/campaign-permissions.guard';
import { RequireCampaignPermissions } from './authorization/require-campaign-permissions.decorator';
import { CurrentCampaignMembership } from './authorization/current-campaign-membership.decorator';
import { CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CampaignAttendanceService } from './campaign-attendance.service';
import { RecordCampaignAttendanceDto } from './dto/attendance.dto';

@Controller('campaigns/:campaignId/events/:eventId/attendance')
@UseGuards(JwtAuthGuard, CampaignMembershipGuard, CampaignPermissionsGuard)
export class CampaignAttendanceController {
  constructor(private readonly campaignAttendanceService: CampaignAttendanceService) {}

  @Post()
  @RequireCampaignPermissions('campaign.attendance.manage')
  record(
    @Param('campaignId') campaignId: string,
    @Param('eventId') eventId: string,
    @Body() dto: RecordCampaignAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignAttendanceService.record(campaignId, eventId, dto, user, membership);
  }

  @Get()
  @RequireCampaignPermissions('campaign.attendance.view')
  findAll(
    @Param('campaignId') campaignId: string,
    @Param('eventId') eventId: string,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignAttendanceService.findAll(campaignId, eventId, membership);
  }

  @Patch(':id/check-out')
  @RequireCampaignPermissions('campaign.attendance.manage')
  checkOut(
    @Param('campaignId') campaignId: string,
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    return this.campaignAttendanceService.checkOut(campaignId, eventId, id, user, membership);
  }
}
