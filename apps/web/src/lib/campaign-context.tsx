'use client';

import { createContext, useContext } from 'react';
import { useCampaignMe, useCurrentCampaign } from './campaign-hooks';
import { Campaign, CampaignMembership } from './campaign-types';

interface CampaignContextValue {
  campaign: Campaign | null;
  membership: CampaignMembership | null;
  permissions: string[];
  loading: boolean;
  hasPermission: (permission: string) => boolean;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const { data: campaign, isLoading: campaignLoading } = useCurrentCampaign();
  const { data: me, isLoading: meLoading } = useCampaignMe(campaign?.id);

  const value: CampaignContextValue = {
    campaign: campaign ?? null,
    membership: me?.membership ?? null,
    permissions: me?.permissions ?? [],
    loading: campaignLoading || (!!campaign && meLoading),
    hasPermission: (permission: string) => me?.permissions?.includes(permission) ?? false,
  };

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useCampaignCtx() {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error('useCampaignCtx must be used within CampaignProvider');
  return ctx;
}
