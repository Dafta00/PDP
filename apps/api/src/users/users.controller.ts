import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddScopeDto } from './dto/add-scope.dto';
import { SetPermissionDto } from './dto/set-permission.dto';

// DATA_ENTRY_OFFICER is deliberately excluded — it can never manage another
// user (see ROLE_HIERARCHY in AuthorizationService), so it has no business
// reaching this controller at all. POLLING_UNIT_OFFICER is included at the
// route level even though most of them can't create anyone yet — the
// per-request `canCreateUsers` gate in AuthorizationService is the real
// enforcement point. @RequirePermissions is the fine-grained layer on top:
// a role that's normally allowed near this controller but had `users.*`
// explicitly revoked from their account is still turned away.
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
  Role.POLLING_UNIT_OFFICER,
)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('users.create')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.create(dto, user);
  }

  @Get()
  @RequirePermissions('users.view')
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const size = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
    return this.usersService.findAll({ skip: (pageNum - 1) * size, take: size }, user);
  }

  @Get(':id')
  @RequirePermissions('users.view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, user);
  }

  /** SUPER_ADMIN-only (enforced in the service) — grants a user an additional geographic unit beyond their primary scope. */
  @Post(':id/scopes')
  @RequirePermissions('users.update')
  addScope(
    @Param('id') id: string,
    @Body() dto: AddScopeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.addScope(id, dto, user);
  }

  @Delete(':id/scopes/:scopeId')
  @RequirePermissions('users.update')
  removeScope(
    @Param('id') id: string,
    @Param('scopeId') scopeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.removeScope(id, scopeId, user);
  }

  /** Grant/revoke a single permission override — the actor must possess and be authorized to delegate it (see AuthorizationService.canGrantPermission). */
  @Put(':id/permissions/:permission')
  @RequirePermissions('users.update')
  setPermission(
    @Param('id') id: string,
    @Param('permission') permission: string,
    @Body() dto: SetPermissionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.setPermission(id, permission, dto.grant, user);
  }

  @Delete(':id/permissions/:permission')
  @RequirePermissions('users.update')
  removePermissionOverride(
    @Param('id') id: string,
    @Param('permission') permission: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.removePermissionOverride(id, permission, user);
  }
}
