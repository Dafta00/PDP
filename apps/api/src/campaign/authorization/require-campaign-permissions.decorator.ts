import { SetMetadata } from '@nestjs/common';
import { CampaignPermission } from './campaign-permissions';

export const CAMPAIGN_PERMISSIONS_KEY = 'campaign_permissions';

/** Any one of the listed campaign permissions is sufficient. Requires CampaignMembershipGuard to run first. */
export const RequireCampaignPermissions = (...permissions: CampaignPermission[]) =>
  SetMetadata(CAMPAIGN_PERMISSIONS_KEY, permissions);
