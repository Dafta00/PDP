'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { OrgUnit } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';

interface FormState {
  firstName: string;
  middleName: string;
  surname: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  occupation: string;
  lgaId: string;
  wardId: string;
  pollingUnitId: string;
}

const INITIAL_STATE: FormState = {
  firstName: '',
  middleName: '',
  surname: '',
  gender: 'MALE',
  dateOfBirth: '',
  phone: '',
  email: '',
  address: '',
  occupation: '',
  lgaId: '',
  wardId: '',
  pollingUnitId: '',
};

function SectionCard({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-xs font-semibold text-brand-600">{step}</span>
          <CardTitle>{title}</CardTitle>
        </div>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</CardContent>
    </Card>
  );
}

export default function RegisterMemberPage() {
  const router = useRouter();
  const showToast = useToast();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lgas, setLgas] = useState<OrgUnit[]>([]);
  const [wards, setWards] = useState<OrgUnit[]>([]);
  const [pollingUnits, setPollingUnits] = useState<OrgUnit[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<OrgUnit[]>('/organization/lgas').then(setLgas).catch(() => setLgas([]));
  }, []);

  useEffect(() => {
    setWards([]);
    setForm((f) => ({ ...f, wardId: '', pollingUnitId: '' }));
    if (!form.lgaId) return;
    api
      .get<OrgUnit[]>(`/organization/wards?lgaId=${form.lgaId}`)
      .then(setWards)
      .catch(() => setWards([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.lgaId]);

  useEffect(() => {
    setPollingUnits([]);
    setForm((f) => ({ ...f, pollingUnitId: '' }));
    if (!form.wardId) return;
    api
      .get<OrgUnit[]>(`/organization/polling-units?wardId=${form.wardId}`)
      .then(setPollingUnits)
      .catch(() => setPollingUnits([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.wardId]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        const fd = new FormData();
        fd.append('file', photoFile);
        const uploaded = await api.upload<{ url: string }>('/files/upload', fd);
        photoUrl = uploaded.url;
      }

      const member = await api.post<{ id: string }>('/members', {
        firstName: form.firstName,
        middleName: form.middleName || undefined,
        surname: form.surname,
        gender: form.gender,
        dateOfBirth: new Date(form.dateOfBirth).toISOString(),
        phone: form.phone,
        email: form.email || undefined,
        address: form.address || undefined,
        occupation: form.occupation || undefined,
        pollingUnitId: form.pollingUnitId,
        photoUrl,
      });

      showToast('Member registered successfully.', 'success');
      router.push(`/members/${member.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to register this member. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Register Member" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Register Member" description="Add a new member to the Gombe Central register." />

        <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
          <SectionCard step="01" title="Personal Information">
            <div>
              <Label required>First Name</Label>
              <Input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
            </div>
            <div>
              <Label>Middle Name</Label>
              <Input value={form.middleName} onChange={(e) => update('middleName', e.target.value)} />
            </div>
            <div>
              <Label required>Surname</Label>
              <Input required value={form.surname} onChange={(e) => update('surname', e.target.value)} />
            </div>
            <div>
              <Label required>Gender</Label>
              <Select value={form.gender} onChange={(e) => update('gender', e.target.value as 'MALE' | 'FEMALE')}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </Select>
            </div>
            <div>
              <Label required>Date of Birth</Label>
              <Input
                type="date"
                required
                value={form.dateOfBirth}
                onChange={(e) => update('dateOfBirth', e.target.value)}
              />
            </div>
          </SectionCard>

          <SectionCard step="02" title="Contact Information">
            <div>
              <Label required>Phone</Label>
              <Input required value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
            </div>
            <div>
              <Label>Occupation</Label>
              <Input value={form.occupation} onChange={(e) => update('occupation', e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => update('address', e.target.value)} />
            </div>
          </SectionCard>

          <SectionCard
            step="03"
            title="Organizational Location"
            description="Determines which staff can manage this member's records."
          >
            <div>
              <Label required>LGA</Label>
              <Select required value={form.lgaId} onChange={(e) => update('lgaId', e.target.value)}>
                <option value="">Select LGA</option>
                {lgas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label required>Ward</Label>
              <Select
                required
                disabled={!form.lgaId}
                value={form.wardId}
                onChange={(e) => update('wardId', e.target.value)}
              >
                <option value="">Select Ward</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label required>Polling Unit</Label>
              <Select
                required
                disabled={!form.wardId}
                value={form.pollingUnitId}
                onChange={(e) => update('pollingUnitId', e.target.value)}
              >
                <option value="">Select Polling Unit</option>
                {pollingUnits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </SectionCard>

          <SectionCard step="04" title="Membership Photo" description="Optional, but recommended for verification.">
            <div className="sm:col-span-3 flex items-center gap-4">
              <Avatar name={`${form.firstName} ${form.surname}`.trim() || '?'} photoUrl={photoPreview} size="lg" />
              <div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="block text-sm text-slate-600"
                />
                <p className="mt-1 text-xs text-slate-400">JPEG, PNG, or WEBP. Max 5MB.</p>
              </div>
            </div>
          </SectionCard>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="submit" disabled={submitting}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Registering…' : 'Register Member'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
