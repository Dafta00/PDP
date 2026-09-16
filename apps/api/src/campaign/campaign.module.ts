import { Module } from '@nestjs/common';
import { CampaignAuthorizationService } from './authorization/campaign-authorization.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignMembershipsController } from './campaign-memberships.controller';
import { CampaignMembershipsService } from './campaign-memberships.service';
import { CampaignTeamsController } from './campaign-teams.controller';
import { CampaignTeamsService } from './campaign-teams.service';
import { CampaignVolunteersController } from './campaign-volunteers.controller';
import { CampaignVolunteersService } from './campaign-volunteers.service';
import { CampaignEventsController } from './campaign-events.controller';
import { CampaignEventsService } from './campaign-events.service';
import { CampaignAttendanceController } from './campaign-attendance.controller';
import { CampaignAttendanceService } from './campaign-attendance.service';
import { CampaignTasksController } from './campaign-tasks.controller';
import { CampaignTasksService } from './campaign-tasks.service';
import { CampaignActivityController } from './campaign-activity.controller';
import { CampaignActivityService } from './campaign-activity.service';
import { CampaignReportsController } from './campaign-reports.controller';
import { CampaignReportsService } from './campaign-reports.service';

@Module({
  controllers: [
    CampaignsController,
    CampaignMembershipsController,
    CampaignTeamsController,
    CampaignVolunteersController,
    CampaignEventsController,
    CampaignAttendanceController,
    CampaignTasksController,
    CampaignActivityController,
    CampaignReportsController,
  ],
  providers: [
    CampaignAuthorizationService,
    CampaignsService,
    CampaignMembershipsService,
    CampaignTeamsService,
    CampaignVolunteersService,
    CampaignEventsService,
    CampaignAttendanceService,
    CampaignTasksService,
    CampaignActivityService,
    CampaignReportsService,
  ],
  exports: [CampaignAuthorizationService],
})
export class CampaignModule {}
