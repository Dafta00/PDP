import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { VerificationService } from './verification.service';
import { VerifyMemberDto } from './dto/verify-member.dto';

@Controller('members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  Role.SUPER_ADMIN,
  Role.STATE_ADMIN,
  Role.SENATORIAL_ADMIN,
  Role.LGA_ADMIN,
  Role.WARD_ADMIN,
  Role.POLLING_UNIT_OFFICER,
  Role.DATA_ENTRY_OFFICER,
)
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('verify')
  verify(@Body() dto: VerifyMemberDto, @CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.verify(dto, user);
  }
}
