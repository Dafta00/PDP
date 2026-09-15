import Image from 'next/image';
import { API_URL } from '@/lib/api-client';
import { StatusBadge } from '@/components/ui/badge';

export interface MembershipCardProps {
  fullName: string;
  membershipId: string;
  status: string;
  lgaName: string;
  wardName: string;
  pollingUnitName: string;
  photoUrl: string | null;
  qrImageDataUrl: string | null;
}

export function MembershipCard({
  fullName,
  membershipId,
  status,
  lgaName,
  wardName,
  pollingUnitName,
  photoUrl,
  qrImageDataUrl,
}: MembershipCardProps) {
  return (
    <div className="w-[340px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md print:shadow-none">
      <div className="relative bg-brand-700 px-4 py-3">
        <div className="absolute inset-x-0 top-0 h-1 bg-party-red" aria-hidden="true" />
        <div className="flex items-center gap-2.5">
          <Image
            src="/brand/pdp-logo.jpeg"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/40"
          />
          <div className="min-w-0 text-left">
            <p className="truncate text-[11px] font-semibold tracking-wide text-white">
              PEOPLES DEMOCRATIC PARTY
            </p>
            <p className="text-[10px] text-brand-100">Gombe Central — Membership Card</p>
          </div>
        </div>
      </div>
      <div className="flex gap-4 px-4 py-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${API_URL}${photoUrl}`} alt={fullName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              No Photo
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{fullName}</p>
          <p className="text-xs text-slate-500">{membershipId}</p>
          <div className="mt-1">
            <StatusBadge status={status} />
          </div>
          <dl className="mt-2 space-y-0.5 text-[11px] text-slate-600">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">LGA</dt>
              <dd className="truncate font-medium">{lgaName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Ward</dt>
              <dd className="truncate font-medium">{wardName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Polling Unit</dt>
              <dd className="truncate font-medium">{pollingUnitName}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="flex items-center justify-center border-t border-dashed border-slate-200 bg-slate-50 py-3">
        {qrImageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrImageDataUrl} alt="Membership QR code" className="h-24 w-24" />
        ) : (
          <p className="text-xs text-slate-400">QR code unavailable</p>
        )}
      </div>
    </div>
  );
}
