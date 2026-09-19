'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { MemberDetail } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { MemberForm } from '@/components/members/member-form';

export default function EditMemberPage() {
  const params = useParams<{ id: string }>();

  const { data: member, isLoading, error, refetch } = useQuery({
    queryKey: ['member', params.id],
    queryFn: () => api.get<MemberDetail>(`/members/${params.id}`),
  });

  if (isLoading) {
    return (
      <>
        <Topbar title="Edit Member" />
        <LoadingState label="Loading member…" />
      </>
    );
  }

  if (error || !member) {
    return (
      <>
        <Topbar title="Edit Member" />
        <ErrorState title="Member not found" onRetry={() => refetch()} />
      </>
    );
  }

  const fullName = [member.firstName, member.middleName, member.surname].filter(Boolean).join(' ');

  return (
    <>
      <Topbar title="Edit Member" />
      <div className="p-4 sm:p-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Members', href: '/members' },
            { label: fullName, href: `/members/${params.id}` },
            { label: 'Edit' },
          ]}
        />
        <PageHeader title={`Edit ${fullName}`} description="Update this member's registered information." />
        <MemberForm mode="edit" memberId={params.id} initialMember={member} />
      </div>
    </>
  );
}
