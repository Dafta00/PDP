import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';
import { Campaign, CampaignMembership } from './campaign-types';

/**
 * There is exactly one campaign in this deployment today (the schema
 * supports more), so the frontend just operates against "the campaign the
 * current user has a role on" — GET /campaigns already returns only
 * campaigns the caller has a membership on (or all of them, for
 * administrative oversight roles).
 */
export function useCurrentCampaign() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Campaign[]>('/campaigns'),
    select: (campaigns) => campaigns[0] ?? null,
  });
}

interface CampaignMe {
  membership: CampaignMembership | null;
  permissions: string[];
}

export function useCampaignMe(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign-me', campaignId],
    queryFn: () => api.get<CampaignMe>(`/campaigns/${campaignId}/me`),
    enabled: !!campaignId,
  });
}

export function hasCampaignPermission(permissions: string[] | undefined, permission: string): boolean {
  return permissions?.includes(permission) ?? false;
}
