'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { TabSwitcher } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { QrScanner } from '@/components/members/qr-scanner';
import { API_URL } from '@/lib/api-client';

interface CheckInResponse {
  member: {
    id: string;
    membershipId: string;
    fullName: string;
    photoUrl: string | null;
    status: string;
  };
}

export function AttendanceCheckIn({ eventId, onChecked }: { eventId: string; onChecked?: () => void }) {
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [membershipId, setMembershipId] = useState('');
  const [checking, setChecking] = useState(false);
  const [success, setSuccess] = useState<CheckInResponse['member'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(body: { token?: string; membershipId?: string }) {
    setChecking(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post<CheckInResponse>(`/events/${eventId}/attendance`, body);
      setSuccess(res.member);
      setMembershipId('');
      onChecked?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to record attendance.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-4">
      <TabSwitcher
        value={mode}
        onChange={setMode}
        tabs={[
          { key: 'scan', label: 'Scan QR' },
          { key: 'manual', label: 'Membership ID' },
        ]}
      />

      {mode === 'scan' && (
        <Card>
          <CardContent>
            <QrScanner onDetected={(token) => submit({ token })} />
          </CardContent>
        </Card>
      )}

      {mode === 'manual' && (
        <Card>
          <CardContent>
            <Label>Membership ID</Label>
            <div className="flex gap-2">
              <Input
                placeholder="PDP-GC-2026-000001"
                value={membershipId}
                onChange={(e) => setMembershipId(e.target.value)}
              />
              <Button disabled={!membershipId || checking} onClick={() => submit({ membershipId })}>
                Check In
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {checking && (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Checking…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-center text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <div className="rounded-md border border-success-200 bg-success-50 p-4">
          <p className="mb-2 flex items-center justify-center gap-1.5 text-center font-semibold text-success-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Checked In
          </p>
          <div className="flex items-center gap-3">
            <Avatar
              name={success.fullName}
              photoUrl={success.photoUrl ? `${API_URL}${success.photoUrl}` : null}
              size="sm"
            />
            <div>
              <p className="font-medium text-slate-900">{success.fullName}</p>
              <p className="text-xs text-slate-500">{success.membershipId}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
