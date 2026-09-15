'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { TabSwitcher } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { LoadingState } from '@/components/ui/states';
import { QrScanner } from '@/components/members/qr-scanner';
import { API_URL } from '@/lib/api-client';

interface VerificationResult {
  verified: boolean;
  reason?: 'NOT_FOUND' | 'QR_REVOKED' | 'AMBIGUOUS_SEARCH';
  member?: {
    membershipId: string;
    fullName: string;
    status: string;
    photoUrl: string | null;
    lga: string;
    ward: string;
    pollingUnit: string;
  };
}

const REASON_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'No member matches that membership ID or search term.',
  QR_REVOKED: 'This QR code is invalid or has been revoked. Ask the member to visit their ward office.',
  AMBIGUOUS_SEARCH: 'More than one member matches — try their membership ID or phone number instead.',
};

export default function VerificationPage() {
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [membershipId, setMembershipId] = useState('');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function verify(body: { token?: string; membershipId?: string; search?: string }) {
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<VerificationResult>('/members/verify', body);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to verify member. Please try again.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <Topbar title="Member Verification" />
      <div className="mx-auto max-w-md p-4 sm:p-6">
        <div className="mb-4 flex justify-center">
          <Image
            src="/brand/pdp-logo.jpeg"
            alt="Peoples Democratic Party"
            width={44}
            height={44}
            className="h-11 w-11 rounded-full object-cover ring-1 ring-slate-200"
          />
        </div>
        <PageHeader
          title="Member Verification"
          description="Scan a QR code or enter details to confirm membership."
        />

        <TabSwitcher
          className="mb-4"
          value={mode}
          onChange={setMode}
          tabs={[
            { key: 'scan', label: 'Scan QR' },
            { key: 'manual', label: 'Manual Entry' },
          ]}
        />

        {mode === 'scan' && (
          <Card>
            <CardContent>
              <QrScanner onDetected={(token) => verify({ token })} />
              <p className="mt-3 text-center text-xs text-slate-500">
                Point the camera at the member&apos;s QR code.
              </p>
            </CardContent>
          </Card>
        )}

        {mode === 'manual' && (
          <Card>
            <CardContent className="space-y-4">
              <div>
                <Label>Membership ID</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="PDP-GC-2026-000001"
                    value={membershipId}
                    onChange={(e) => setMembershipId(e.target.value)}
                  />
                  <Button
                    disabled={!membershipId || checking}
                    onClick={() => verify({ membershipId })}
                  >
                    Verify
                  </Button>
                </div>
              </div>
              <div>
                <Label>Search by phone number</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="080…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Button disabled={!search || checking} onClick={() => verify({ search })}>
                    Verify
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {checking && <LoadingState label="Checking…" />}
        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-red-600">
            {error}
          </p>
        )}

        {result && !result.verified && (
          <div
            className="relative mt-4 overflow-hidden rounded-md border border-red-200 bg-red-50 p-4 text-center"
            role="alert"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-red-600" aria-hidden="true" />
            <XCircle className="mx-auto h-8 w-8 text-red-500" aria-hidden="true" />
            <p className="mt-2 font-heading text-lg font-semibold text-red-700">Not Verified</p>
            <p className="mt-1 text-sm text-red-700">{REASON_MESSAGES[result.reason ?? 'NOT_FOUND']}</p>
          </div>
        )}

        {result?.verified && result.member && (
          <div className="relative mt-4 overflow-hidden rounded-md border border-success-200 bg-success-50 p-4">
            <div className="absolute inset-x-0 top-0 h-1 bg-success-600" aria-hidden="true" />
            <div className="mb-3 flex flex-col items-center text-center">
              <CheckCircle2 className="h-8 w-8 text-success-600" aria-hidden="true" />
              <p className="mt-1 font-heading text-lg font-semibold text-success-700">Verified Member</p>
              <p className="text-xs text-success-600">PDP Gombe Central</p>
            </div>
            <div className="flex items-center gap-4">
              <Avatar
                name={result.member.fullName}
                photoUrl={result.member.photoUrl ? `${API_URL}${result.member.photoUrl}` : null}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{result.member.fullName}</p>
                <p className="text-xs text-slate-500">{result.member.membershipId}</p>
                <div className="mt-1">
                  <StatusBadge status={result.member.status} />
                </div>
              </div>
            </div>
            <dl className="mt-3 space-y-1 text-sm text-slate-700">
              <div className="flex justify-between">
                <dt className="text-slate-500">LGA</dt>
                <dd className="font-medium">{result.member.lga}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Ward</dt>
                <dd className="font-medium">{result.member.ward}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Polling Unit</dt>
                <dd className="font-medium">{result.member.pollingUnit}</dd>
              </div>
            </dl>
            {result.member.status !== 'ACTIVE' && (
              <p className="mt-3 flex items-start gap-1.5 rounded bg-warning-100 p-2 text-xs text-warning-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                This member&apos;s status is {result.member.status}, not ACTIVE — confirm eligibility
                before proceeding.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
