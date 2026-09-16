import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ReportsService } from './reports.service';

const CAN_VIEW_REPORTS: Role[] = [
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
  Role.POLLING_UNIT_OFFICER,
  Role.DATA_ENTRY_OFFICER,
];

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...CAN_VIEW_REPORTS)
@RequirePermissions('reports.view')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('membership')
  getMembershipReport(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getMembershipReport(user);
  }

  @Get('activities')
  getActivityReport(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getActivityReport(user);
  }

  @Get('resources')
  getResourceReport(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getResourceReport(user);
  }

  @Get('distributions')
  getDistributionReport(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getDistributionReport(user);
  }
}
