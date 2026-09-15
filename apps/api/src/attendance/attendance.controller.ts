import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';

const CAN_RECORD_ATTENDANCE = [
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
  Role.POLLING_UNIT_OFFICER,
];

@Controller('events/:eventId/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CAN_RECORD_ATTENDANCE)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  checkIn(
    @Param('eventId') eventId: string,
    @Body() dto: CheckInDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.checkIn(eventId, dto, user);
  }

  @Get()
  list(
    @Param('eventId') eventId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const size = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
    return this.attendanceService.list(eventId, user, { skip: (pageNum - 1) * size, take: size });
  }
}
