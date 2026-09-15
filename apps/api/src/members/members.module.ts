import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { MembershipIdService } from './membership-id.service';

@Module({
  controllers: [MembersController],
  providers: [MembersService, MembershipIdService],
  exports: [MembersService, MembershipIdService],
})
export class MembersModule {}
