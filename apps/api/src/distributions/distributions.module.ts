import { Module } from '@nestjs/common';
import { DistributionsService } from './distributions.service';
import { DistributionsController } from './distributions.controller';
import { ResourcesModule } from '../resources/resources.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [ResourcesModule, VerificationModule],
  controllers: [DistributionsController],
  providers: [DistributionsService],
})
export class DistributionsModule {}
