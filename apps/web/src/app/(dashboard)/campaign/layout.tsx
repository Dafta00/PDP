'use client';

import { ShieldOff } from 'lucide-react';
import { CampaignProvider, useCampaignCtx } from '@/lib/campaign-context';
import { Topbar } from '@/components/layout/topbar';
import { LoadingState } from '@/components/ui/states';

function CampaignGate({ children }: { children: React.ReactNode }) {
  const { campaign, membership, loading } = useCampaignCtx();

  if (loading) {
    return (
      <>
        <Topbar title="Campaign" />
        <LoadingState label="Loading campaign…" />
      </>
    );
  }

  if (!campaign || !membership) {
    return (
      <>
        <Topbar title="Campaign" />
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-24 text-center">
          <ShieldOff className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-700">No campaign access</p>
          <p className="max-w-sm text-sm text-slate-500">
            Your account doesn&apos;t have a campaign role. Ask a campaign administrator to add you.
          </p>
        </div>
      </>
    );
  }

  return <>{children}</>;
}

export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  return (
    <CampaignProvider>
      <CampaignGate>{children}</CampaignGate>
    </CampaignProvider>
  );
}
