'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MapPinned, CheckCircle2, CalendarClock } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useCampaignCtx } from '@/lib/campaign-context';
import { CampaignCoverage } from '@/lib/campaign-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState } from '@/components/ui/states';

export default function CampaignOrganizationPage() {
  const { campaign } = useCampaignCtx();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-coverage', campaign?.id],
    queryFn: () => api.get<CampaignCoverage>(`/campaigns/${campaign?.id}/coverage`),
    enabled: !!campaign,
  });

  return (
    <>
      <Topbar title="Campaign Organization" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Campaign Organization"
          description="Operational coverage across Gombe State's existing geographic hierarchy — never a duplicate of it."
          actions={
            <Link href="/organization">
              <Button variant="secondary" size="sm">
                <MapPinned className="h-4 w-4" aria-hidden="true" />
                Open Geographic Explorer
              </Button>
            </Link>
          }
        />

        {isLoading && <LoadingState label="Loading coverage…" />}
        {error && <ErrorState description="Unable to load coverage." onRetry={() => refetch()} />}

        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <CardContent className="py-5 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Districts with Activity</p>
                  <p className="mt-1 font-heading text-2xl font-semibold text-brand-700">{data.districtsWithActivity}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-5 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">LGAs with Activity</p>
                  <p className="mt-1 font-heading text-2xl font-semibold text-brand-700">{data.lgasWithActivity}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-5 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Wards with Activity</p>
                  <p className="mt-1 font-heading text-2xl font-semibold text-brand-700">{data.wardsWithActivity}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-5 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Polling Units with Activity</p>
                  <p className="mt-1 font-heading text-2xl font-semibold text-brand-700">{data.pollingUnitsWithActivity}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden="true" />
                  <CardTitle>Events Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-heading text-3xl font-semibold text-slate-900">{data.eventsCompleted}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  <CardTitle>Events Scheduled</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-heading text-3xl font-semibold text-slate-900">{data.eventsScheduled}</p>
                </CardContent>
              </Card>
            </div>

            <p className="text-xs text-slate-400">
              These figures measure organizational reach — where events, teams, and tasks have been recorded — never
              voter support. The platform does not classify or predict individual political preference.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
