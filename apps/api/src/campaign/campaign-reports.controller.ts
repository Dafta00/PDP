import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignMembershipGuard } from './authorization/campaign-membership.guard';
import { CampaignPermissionsGuard } from './authorization/campaign-permissions.guard';
import { RequireCampaignPermissions } from './authorization/require-campaign-permissions.decorator';
import { CurrentCampaignMembership } from './authorization/current-campaign-membership.decorator';
import { CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { CampaignReportsService } from './campaign-reports.service';

@Controller('campaigns/:campaignId')
@UseGuards(JwtAuthGuard, CampaignMembershipGuard, CampaignPermissionsGuard)
export class CampaignReportsController {
  constructor(private readonly campaignReportsService: CampaignReportsService) {}

  @Get('dashboard')
  @RequireCampaignPermissions('campaign.dashboard.view')
  dashboard(@Param('campaignId') campaignId: string, @CurrentCampaignMembership() membership: CampaignMembershipLike) {
    return this.campaignReportsService.getDashboard(campaignId, membership);
  }

  @Get('coverage')
  @RequireCampaignPermissions('campaign.reports.view')
  coverage(@Param('campaignId') campaignId: string, @CurrentCampaignMembership() membership: CampaignMembershipLike) {
    return this.campaignReportsService.getCoverage(campaignId, membership);
  }

  @Get('reports/events')
  @RequireCampaignPermissions('campaign.reports.view')
  async eventsReport(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    await this.campaignReportsService.recordReportGenerated(user, campaignId, 'events');
    return this.campaignReportsService.getEventsReport(campaignId, membership);
  }

  @Get('reports/attendance')
  @RequireCampaignPermissions('campaign.reports.view')
  async attendanceReport(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    await this.campaignReportsService.recordReportGenerated(user, campaignId, 'attendance');
    return this.campaignReportsService.getAttendanceReport(campaignId, membership);
  }

  @Get('reports/teams')
  @RequireCampaignPermissions('campaign.reports.view')
  async teamsReport(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    await this.campaignReportsService.recordReportGenerated(user, campaignId, 'teams');
    return this.campaignReportsService.getTeamsReport(campaignId, membership);
  }

  @Get('reports/volunteers')
  @RequireCampaignPermissions('campaign.reports.view')
  async volunteersReport(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    await this.campaignReportsService.recordReportGenerated(user, campaignId, 'volunteers');
    return this.campaignReportsService.getVolunteersReport(campaignId, membership);
  }

  @Get('reports/tasks')
  @RequireCampaignPermissions('campaign.reports.view')
  async tasksReport(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCampaignMembership() membership: CampaignMembershipLike,
  ) {
    await this.campaignReportsService.recordReportGenerated(user, campaignId, 'tasks');
    return this.campaignReportsService.getTasksReport(campaignId, membership);
  }

  @Get('reports/resources')
  @RequireCampaignPermissions('campaign.reports.view')
  async resourcesReport(@Param('campaignId') campaignId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.campaignReportsService.recordReportGenerated(user, campaignId, 'resources');
    return this.campaignReportsService.getResourcesReport(campaignId);
  }
}
