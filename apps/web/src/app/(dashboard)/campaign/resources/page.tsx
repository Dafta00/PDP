'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useCampaignCtx } from '@/lib/campaign-context';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/states';

interface ResourceRow {
  id: string;
  name: string;
  unit: string | null;
  totalQuantity: number;
  remainingQuantity: number;
  allocations: { id: string; quantity: number; remainingQuantity: number }[];
}

export default function CampaignResourcesPage() {
  const { campaign, hasPermission } = useCampaignCtx();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-resources', campaign?.id],
    queryFn: () => api.get<{ resources: ResourceRow[] }>(`/campaigns/${campaign?.id}/reports/resources`),
    enabled: !!campaign && hasPermission('campaign.resources.view'),
  });

  return (
    <>
      <Topbar title="Campaign Resources" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Campaign Resources"
          description="Materials and equipment tagged to this campaign — allocated and tracked through the same audited resource system used platform-wide."
          actions={
            <Link href="/resources">
              <Button variant="secondary" size="sm">Open Resource Inventory</Button>
            </Link>
          }
        />

        {isLoading && <LoadingState label="Loading resources…" />}
        {error && <ErrorState description="Unable to load resources." onRetry={() => refetch()} />}
        {data && data.resources.length === 0 && (
          <EmptyState icon={PackageSearch} title="No campaign resources yet" description="Tag a resource with this campaign from the Resource Inventory page." />
        )}

        {data && data.resources.length > 0 && (
          <TableContainer>
            <THead>
              <Th>Resource</Th>
              <Th>Total</Th>
              <Th>Remaining (unallocated)</Th>
              <Th>Allocations</Th>
            </THead>
            <TBody>
              {data.resources.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium text-slate-800">{r.name}</Td>
                  <Td>{r.totalQuantity.toLocaleString()} {r.unit ?? ''}</Td>
                  <Td>{r.remainingQuantity.toLocaleString()}</Td>
                  <Td>{r.allocations.length}</Td>
                </tr>
              ))}
            </TBody>
          </TableContainer>
        )}
      </div>
    </>
  );
}
