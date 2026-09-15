import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DistributionsService } from './distributions.service';
import { CreateDistributionDto, UpdateDistributionStatusDto } from './dto/create-distribution.dto';
import { CreateDistributionAllocationDto } from './dto/create-distribution-allocation.dto';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto';

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

@Controller('distributions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DistributionsController {
  constructor(private readonly distributionsService: DistributionsService) {}

  @Post()
  @Roles(...TOP_LEVEL_ADMINS)
  create(@Body() dto: CreateDistributionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.distributionsService.create(dto, user);
  }

  @Get()
  @Roles(...CAN_VIEW)
  findAll() {
    return this.distributionsService.findAll();
  }

  @Get(':id')
  @Roles(...CAN_VIEW)
  findOne(@Param('id') id: string) {
    return this.distributionsService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(...TOP_LEVEL_ADMINS)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDistributionStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.distributionsService.updateStatus(id, dto, user);
  }

  @Post(':id/allocations')
  @Roles(...CAN_ALLOCATE)
  createAllocation(
    @Param('id') id: string,
    @Body() dto: CreateDistributionAllocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.distributionsService.createAllocation(id, dto, user);
  }

  @Get(':id/allocations')
  @Roles(...CAN_VIEW)
  listAllocations(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.distributionsService.listAllocations(id, user);
  }

  @Post(':id/receipts')
  @Roles(...CAN_VIEW)
  confirmReceipt(
    @Param('id') id: string,
    @Body() dto: ConfirmReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.distributionsService.confirmReceipt(id, dto, user);
  }

  @Get(':id/receipts')
  @Roles(...CAN_VIEW)
  listReceipts(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.distributionsService.listReceipts(id, user);
  }

  @Post(':id/receipts/:receiptId/reverse')
  @Roles(...CAN_VIEW)
  reverseReceipt(
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.distributionsService.reverseReceipt(id, receiptId, user);
  }
}
