import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto, UpdateMemberStatusDto } from './dto/query-member.dto';

const CAN_MANAGE_MEMBERS = [
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
  Role.POLLING_UNIT_OFFICER,
  Role.DATA_ENTRY_OFFICER,
];

const CAN_CHANGE_STATUS = [
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
];

@Controller('members')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  @Roles(...CAN_MANAGE_MEMBERS)
  create(@Body() dto: CreateMemberDto, @CurrentUser() user: AuthenticatedUser) {
    return this.membersService.create(dto, user);
  }

  @Get()
  @Roles(...CAN_MANAGE_MEMBERS)
  findAll(@Query() query: QueryMemberDto, @CurrentUser() user: AuthenticatedUser) {
    return this.membersService.findAll(query, user);
  }

  @Get(':id')
  @Roles(...CAN_MANAGE_MEMBERS)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.membersService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...CAN_MANAGE_MEMBERS)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membersService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(...CAN_CHANGE_STATUS)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMemberStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membersService.updateStatus(id, dto, user);
  }

  @Get(':id/qr-image')
  @Roles(...CAN_MANAGE_MEMBERS)
  async getQrImage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const qrImageDataUrl = await this.membersService.getQrImage(id, user);
    return { qrImageDataUrl };
  }
}
