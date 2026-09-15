import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ResourcesService } from './resources.service';
import { CreateResourceDto, RestockResourceDto } from './dto/create-resource.dto';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';

const TOP_LEVEL_ADMINS = [Role.SUPER_ADMIN, Role.STATE_ADMIN, Role.SENATORIAL_ADMIN];

const CAN_VIEW = [
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
  Role.POLLING_UNIT_OFFICER,
];

const CAN_ALLOCATE = [
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
];

@Controller('resources')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  @Roles(...TOP_LEVEL_ADMINS)
  createResource(@Body() dto: CreateResourceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.resourcesService.createResource(dto, user);
  }

  @Get()
  @Roles(...CAN_VIEW)
  findAllResources() {
    return this.resourcesService.findAllResources();
  }

  @Get(':id')
  @Roles(...CAN_VIEW)
  findResourceOne(@Param('id') id: string) {
    return this.resourcesService.findResourceOne(id);
  }

  @Post(':id/restock')
  @Roles(...TOP_LEVEL_ADMINS)
  restock(
    @Param('id') id: string,
    @Body() dto: RestockResourceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.restock(id, dto, user);
  }

  @Post('allocations')
  @Roles(...CAN_ALLOCATE)
  createAllocation(@Body() dto: CreateAllocationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.resourcesService.createAllocation(dto, user);
  }

  @Get('allocations/list')
  @Roles(...CAN_VIEW)
  listAllocations(@Query('resourceId') resourceId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.resourcesService.listAllocations(user, resourceId);
  }

  @Get('allocations/:id')
  @Roles(...CAN_VIEW)
  findAllocationOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.resourcesService.findAllocationOne(id, user);
  }

  @Post('allocations/:id/transactions')
  @Roles(...CAN_VIEW)
  createTransaction(
    @Param('id') id: string,
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resourcesService.createTransaction(id, dto, user);
  }

  @Get('allocations/:id/transactions')
  @Roles(...CAN_VIEW)
  listTransactions(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.resourcesService.listTransactions(id, user);
  }
}
