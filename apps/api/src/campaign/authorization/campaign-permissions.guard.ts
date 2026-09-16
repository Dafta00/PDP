import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAMPAIGN_PERMISSIONS_KEY } from './require-campaign-permissions.decorator';
import { CampaignAuthorizationService } from './campaign-authorization.service';
import { CampaignPermission } from './campaign-permissions';

/** Fine-grained permission gate for campaign routes — runs after CampaignMembershipGuard, which populates request.campaignMembership. */
@Injectable()
export class CampaignPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<CampaignPermission[] | undefined>(CAMPAIGN_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const membership = request.campaignMembership;
    if (!membership) throw new ForbiddenException('You do not have permission to perform this action.');

    for (const permission of required) {
      if (await this.campaignAuthorization.hasCampaignPermission(membership, permission)) return true;
    }
    throw new ForbiddenException('You do not have permission to perform this action.');
  }
}
