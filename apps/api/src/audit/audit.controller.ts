import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.STATE_ADMIN, Role.SENATORIAL_ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
  ) {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const size = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);

    const { items, total } = await this.auditService.list({
      skip: (pageNum - 1) * size,
      take: size,
      action,
      entityType,
    });

    return { items, total, page: pageNum, pageSize: size };
  }
}
