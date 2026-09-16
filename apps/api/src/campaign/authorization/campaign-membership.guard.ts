import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { CampaignAuthorizationService } from './campaign-authorization.service';

/**
 * Resolves the caller's CampaignMembership for the `:campaignId` route
 * param and attaches it to the request as `campaignMembership`. Runs after
 * JwtAuthGuard (needs `request.user`) and throws (via
 * requireActiveMembership) if the caller has no active campaign role on
 * this campaign — the same "you can't act here at all" gate the
 * administrative RolesGuard provides, but for the campaign domain's own
 * role table rather than User.role.
 */
@Injectable()
export class CampaignMembershipGuard implements CanActivate {
  constructor(private readonly campaignAuthorization: CampaignAuthorizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const campaignId = request.params?.campaignId;
    if (!campaignId) return false;

    const membership = await this.campaignAuthorization.requireActiveMembership(request.user, campaignId);
    request.campaignMembership = membership;
    return true;
  }
}
