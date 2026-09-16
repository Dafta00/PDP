import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { OrganizationService } from './organization.service';
import {
  CreateLgaDto,
  CreatePollingUnitDto,
  CreateSenatorialDistrictDto,
  CreateStateDto,
  CreateWardDto,
  RenameDto,
} from './dto/org-unit.dto';

const TOP_LEVEL_ADMINS = [Role.SUPER_ADMIN, Role.STATE_ADMIN];

@Controller('organization')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('states')
  @RequirePermissions('geography.view')
  listStates() {
    return this.organizationService.listStates();
  }

  @Post('states')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS)
  @RequirePermissions('geography.manage')
  createState(@Body() dto: CreateStateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createState(dto, user.id);
  }

  @Get('senatorial-districts')
  @RequirePermissions('geography.view')
  listDistricts(@Query('stateId') stateId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.listDistricts(stateId, user);
  }

  @Post('senatorial-districts')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS)
  @RequirePermissions('geography.manage')
  createDistrict(@Body() dto: CreateSenatorialDistrictDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createDistrict(dto, user.id);
  }

  @Get('lgas')
  @RequirePermissions('geography.view')
  listLgas(
    @Query('senatorialDistrictId') senatorialDistrictId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.listLgas(senatorialDistrictId, user);
  }

  @Post('lgas')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS)
  @RequirePermissions('geography.manage')
  createLga(@Body() dto: CreateLgaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createLga(dto, user);
  }

  @Get('wards')
  @RequirePermissions('geography.view')
  listWards(@Query('lgaId') lgaId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.listWards(lgaId, user);
  }

  @Post('wards')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS, Role.SENATORIAL_ADMIN, Role.LGA_ADMIN)
  @RequirePermissions('geography.manage')
  createWard(@Body() dto: CreateWardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createWard(dto, user);
  }

  @Patch('wards/:id')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS, Role.SENATORIAL_ADMIN, Role.LGA_ADMIN)
  @RequirePermissions('geography.manage')
  renameWard(
    @Param('id') id: string,
    @Body() dto: RenameDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.renameWard(id, dto, user);
  }

  @Get('polling-units')
  @RequirePermissions('geography.view')
  listPollingUnits(
    @Query('wardId') wardId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.listPollingUnits(wardId, user);
  }

  @Post('polling-units')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS, Role.SENATORIAL_ADMIN, Role.LGA_ADMIN, Role.WARD_ADMIN)
  @RequirePermissions('geography.manage')
  createPollingUnit(@Body() dto: CreatePollingUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createPollingUnit(dto, user);
  }

  @Patch('polling-units/:id')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS, Role.SENATORIAL_ADMIN, Role.LGA_ADMIN, Role.WARD_ADMIN)
  @RequirePermissions('geography.manage')
  renamePollingUnit(
    @Param('id') id: string,
    @Body() dto: RenameDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.renamePollingUnit(id, dto, user);
  }
}
