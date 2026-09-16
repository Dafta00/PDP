import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.SUPER_ADMIN, Role.STATE_ADMIN, Role.SENATORIAL_ADMIN)
@RequirePermissions('audit.view')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('action') action: string | undefined,
    @Query('entityType') entityType: string | undefined,
    @Query('entityId') entityId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const size = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);

    const { items, total } = await this.auditService.list(
      { skip: (pageNum - 1) * size, take: size, action, entityType, entityId },
      user,
    );

    return { items, total, page: pageNum, pageSize: size };
  }
}
