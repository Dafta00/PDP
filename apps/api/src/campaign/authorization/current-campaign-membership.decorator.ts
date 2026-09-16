import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CampaignMembershipLike } from './campaign-authorization.service';

export const CurrentCampaignMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CampaignMembershipLike => {
    const request = ctx.switchToHttp().getRequest();
    return request.campaignMembership;
  },
);
