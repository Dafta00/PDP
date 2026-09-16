import { Global, Module } from '@nestjs/common';
import { OrgScopeService } from './scope/org-scope.service';
import { AuthorizationService } from './authorization/authorization.service';

@Global()
@Module({
  providers: [OrgScopeService, AuthorizationService],
  exports: [OrgScopeService, AuthorizationService],
})
export class CommonModule {}
