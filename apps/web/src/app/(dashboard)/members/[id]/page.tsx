'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Phone, MapPin, IdCard, Printer, Pencil, ShieldCheck, Eye, EyeOff, Settings2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { MemberDetail, MemberStatus } from '@/lib/types';
import { educationLevelLabel } from '@/lib/education-levels';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { MembershipCard } from '@/components/members/membership-card';

const CAN_CHANGE_STATUS = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN', 'LGA_ADMIN', 'WARD_ADMIN'];

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

function GroupCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Phone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** NIN gets its own treatment — visually flagged as sensitive, never revealed by default even to a Super Admin. */
function NinValue({ member }: { member: MemberDetail }) {
  const [revealed, setRevealed] = useState(false);
  const canView = member.nin !== undefined;

  if (!canView) {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {member.hasNin ? 'Restricted (Super Admin only)' : 'Not provided'}
      </span>
    );
  }

  if (!member.hasNin || !member.nin) {
    return <span className="text-slate-400">Not provided</span>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{revealed ? member.nin : '•'.repeat(member.nin.length)}</span>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="text-slate-400 hover:text-slate-600"
        aria-label={revealed ? 'Hide NIN' : 'Reveal NIN'}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </span>
  );
}

export default function MemberProfilePage() {
  const params = useParams<{ id: string }>();
  const { user, hasPermission } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [statusUpdating, setStatusUpdating] = useState(false);

  const { data: member, isLoading, error, refetch } = useQuery({
    queryKey: ['member', params.id],
    queryFn: () => api.get<MemberDetail>(`/members/${params.id}`),
  });

  const { data: qr } = useQuery({
    queryKey: ['member-qr', params.id],
    queryFn: () => api.get<{ qrImageDataUrl: string | null }>(`/members/${params.id}/qr-image`),
    enabled: !!member,
  });

  async function changeStatus(status: MemberStatus) {
    setStatusUpdating(true);
    try {
      await api.patch(`/members/${params.id}/status`, { status });
      showToast(`Member marked ${status.toLowerCase()}.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['member', params.id] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update status.', 'error');
    } finally {
      setStatusUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <>
        <Topbar title="Member Profile" />
        <LoadingState label="Loading member…" />
      </>
    );
  }

  if (error || !member) {
    return (
      <>
        <Topbar title="Member Profile" />
        <ErrorState title="Member not found" onRetry={() => refetch()} />
      </>
    );
  }

  const fullName = [member.firstName, member.middleName, member.surname].filter(Boolean).join(' ');
  const canEdit = hasPermission('members.update');

  return (
    <>
      <Topbar title="Member Profile" />
      <div className="p-4 sm:p-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Members', href: '/members' },
            { label: fullName },
          ]}
        />
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={fullName} photoUrl={member.photoUrl} size="lg" />
            <div>
              <h1 className="font-heading text-lg font-semibold text-slate-900">{fullName}</h1>
              <p className="text-sm text-slate-500">{member.membershipId}</p>
              <div className="mt-1">
                <StatusBadge status={member.status} />
              </div>
            </div>
          </div>
          {canEdit && (
            <Link href={`/members/${params.id}/edit`}>
              <Button variant="secondary">
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit Member
              </Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <GroupCard icon={Phone} title="Personal Information">
              <DetailRow label="Full Name" value={fullName} />
              <DetailRow label="Phone Number" value={member.phone} />
              <DetailRow label="Email" value={member.email ?? '—'} />
              <DetailRow label="Gender" value={member.gender} />
              <DetailRow label="Date of Birth" value={new Date(member.dateOfBirth).toLocaleDateString()} />
              <DetailRow label="Occupation" value={member.occupation ?? '—'} />
              <DetailRow label="Address" value={member.address ?? '—'} />
              <DetailRow
                label="Level of Education"
                value={
                  member.educationLevel === 'OTHER' && member.educationLevelOther
                    ? `Other — ${member.educationLevelOther}`
                    : educationLevelLabel(member.educationLevel)
                }
              />
            </GroupCard>

            <GroupCard icon={IdCard} title="Identification">
              <DetailRow label="Member ID" value={member.membershipId} />
              <DetailRow label="NIN" value={<NinValue member={member} />} />
              <DetailRow label="PVC Identifier" value={member.pvcNumber ?? 'Not provided'} />
              <DetailRow label="QR Identifier" value={member.qrCode?.status ?? 'Not issued'} />
            </GroupCard>

            <GroupCard icon={MapPin} title="Organizational Information">
              <DetailRow label="Senatorial District" value={member.lga.senatorialDistrict?.name ?? '—'} />
              <DetailRow label="LGA" value={member.lga.name} />
              <DetailRow label="Ward" value={member.ward.name} />
              <DetailRow label="Polling Unit" value={member.pollingUnit.name} />
              <DetailRow label="Membership Status" value={<StatusBadge status={member.status} />} />
              <DetailRow label="Registration Date" value={new Date(member.dateJoined).toLocaleDateString()} />
            </GroupCard>

            {(member.createdBy || member.createdAt) && (
              <GroupCard icon={Settings2} title="System Information">
                <DetailRow label="Created By" value={member.createdBy?.fullName ?? '—'} />
                <DetailRow label="Created At" value={new Date(member.createdAt).toLocaleString()} />
                <DetailRow label="Updated At" value={new Date(member.updatedAt).toLocaleString()} />
              </GroupCard>
            )}

            {user && CAN_CHANGE_STATUS.includes(user.role) && (
              <Card>
                <CardHeader>
                  <CardTitle>Membership Status</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  <Select
                    defaultValue=""
                    disabled={statusUpdating}
                    onChange={(e) => {
                      if (e.target.value) changeStatus(e.target.value as MemberStatus);
                    }}
                    className="max-w-xs"
                  >
                    <option value="">Change status…</option>
                    {(['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'] as MemberStatus[])
                      .filter((s) => s !== member.status)
                      .map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                  </Select>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex justify-center">
              <MembershipCard
                fullName={fullName}
                membershipId={member.membershipId}
                status={member.status}
                lgaName={member.lga.name}
                wardName={member.ward.name}
                pollingUnitName={member.pollingUnit.name}
                photoUrl={member.photoUrl}
                qrImageDataUrl={qr?.qrImageDataUrl ?? null}
              />
            </div>
            <div className="flex justify-center print:hidden">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print Membership Card
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
