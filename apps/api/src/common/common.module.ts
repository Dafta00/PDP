import { Global, Module } from '@nestjs/common';
import { OrgScopeService } from './scope/org-scope.service';

@Global()
@Module({
  providers: [OrgScopeService],
  exports: [OrgScopeService],
})
export class CommonModule {}
