import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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

const TOP_LEVEL_ADMINS = [Role.SUPER_ADMIN, Role.STATE_ADMIN, Role.SENATORIAL_ADMIN];

@Controller('organization')
@UseGuards(JwtAuthGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('states')
  listStates() {
    return this.organizationService.listStates();
  }

  @Post('states')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS)
  createState(@Body() dto: CreateStateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createState(dto, user.id);
  }

  @Get('senatorial-districts')
  listDistricts(@Query('stateId') stateId?: string) {
    return this.organizationService.listDistricts(stateId);
  }

  @Post('senatorial-districts')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS)
  createDistrict(@Body() dto: CreateSenatorialDistrictDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createDistrict(dto, user.id);
  }

  @Get('lgas')
  listLgas(@Query('senatorialDistrictId') senatorialDistrictId?: string) {
    return this.organizationService.listLgas(senatorialDistrictId);
  }

  @Post('lgas')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS)
  createLga(@Body() dto: CreateLgaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createLga(dto, user.id);
  }

  @Get('wards')
  listWards(@Query('lgaId') lgaId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.listWards(lgaId, user);
  }

  @Post('wards')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS, Role.LGA_ADMIN)
  createWard(@Body() dto: CreateWardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createWard(dto, user);
  }

  @Patch('wards/:id')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS, Role.LGA_ADMIN)
  renameWard(
    @Param('id') id: string,
    @Body() dto: RenameDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.renameWard(id, dto, user);
  }

  @Get('polling-units')
  listPollingUnits(
    @Query('wardId') wardId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.listPollingUnits(wardId, user);
  }

  @Post('polling-units')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS, Role.LGA_ADMIN, Role.WARD_ADMIN)
  createPollingUnit(@Body() dto: CreatePollingUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createPollingUnit(dto, user);
  }

  @Patch('polling-units/:id')
  @UseGuards(RolesGuard)
  @Roles(...TOP_LEVEL_ADMINS, Role.LGA_ADMIN, Role.WARD_ADMIN)
  renamePollingUnit(
    @Param('id') id: string,
    @Body() dto: RenameDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.renamePollingUnit(id, dto, user);
  }
}
