import { Body, Controller, Get, Param, ParseEnumPipe, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { PERMISSIONS, DELEGABLE_PERMISSIONS } from '../common/authorization/permissions';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
  Role.POLLING_UNIT_OFFICER,
)
export class PermissionsController {
  constructor(private readonly authorization: AuthorizationService) {}

  /** The full permission catalog, for rendering grant/revoke checkboxes — not scoped to the caller's own permissions. */
  @Get('catalog')
  @RequirePermissions('permissions.view')
  catalog() {
    return { permissions: PERMISSIONS, delegable: Array.from(DELEGABLE_PERMISSIONS) };
  }

  /** The current effective permission set for the calling user, resolved via role defaults + any personal overrides. */
  @Get('me')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return { permissions: Array.from(await this.authorization.getEffectivePermissions(user)).sort() };
  }

  @Get('roles')
  @RequirePermissions('permissions.view')
  async roles() {
    return this.authorization.listRolePermissions();
  }

  @Put('roles/:role')
  @RequirePermissions('permissions.manage')
  async updateRole(
    @Param('role', new ParseEnumPipe(Role)) role: Role,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const permissions = await this.authorization.setRolePermissions(role, dto.permissions, user);
    return { role, permissions };
  }
}
