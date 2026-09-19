'use client';

import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { MemberForm } from '@/components/members/member-form';

export default function RegisterMemberPage() {
  return (
    <>
      <Topbar title="Register Member" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Register Member" description="Add a new member to the Gombe State register." />
        <MemberForm mode="create" />
      </div>
    </>
  );
}
