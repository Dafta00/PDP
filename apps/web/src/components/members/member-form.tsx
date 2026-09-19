'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Camera, ShieldAlert, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { EducationLevel, MemberDetail, OrgUnit } from '@/lib/types';
import { EDUCATION_LEVEL_OPTIONS } from '@/lib/education-levels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, FieldHint } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { CameraCapture } from './camera-capture';

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
  educationLevel: EducationLevel | '';
  educationLevelOther: string;
  nin: string;
  pvcNumber: string;
  lgaId: string;
  wardId: string;
  pollingUnitId: string;
}

const EMPTY_STATE: FormState = {
  firstName: '',
  middleName: '',
  surname: '',
  gender: 'MALE',
  dateOfBirth: '',
  phone: '',
  email: '',
  address: '',
  occupation: '',
  educationLevel: '',
  educationLevelOther: '',
  nin: '',
  pvcNumber: '',
  lgaId: '',
  wardId: '',
  pollingUnitId: '',
};

function stateFromMember(member: MemberDetail): FormState {
  return {
    firstName: member.firstName,
    middleName: member.middleName ?? '',
    surname: member.surname,
    gender: member.gender,
    dateOfBirth: member.dateOfBirth.slice(0, 10),
    phone: member.phone,
    email: member.email ?? '',
    address: member.address ?? '',
    occupation: member.occupation ?? '',
    educationLevel: member.educationLevel ?? '',
    educationLevelOther: member.educationLevelOther ?? '',
    // Never prefilled from a masked/absent value — see the NIN field notes
    // below. When the caller CAN see the real NIN (SUPER_ADMIN), it is
    // prefilled so they can review/correct it.
    nin: member.nin ?? '',
    pvcNumber: member.pvcNumber ?? '',
    lgaId: member.lgaId,
    wardId: member.wardId,
    pollingUnitId: member.pollingUnitId,
  };
}

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

interface MemberFormProps {
  mode: 'create' | 'edit';
  memberId?: string;
  initialMember?: MemberDetail;
}

export function MemberForm({ mode, memberId, initialMember }: MemberFormProps) {
  const router = useRouter();
  const showToast = useToast();

  const [form, setForm] = useState<FormState>(initialMember ? stateFromMember(initialMember) : EMPTY_STATE);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingPhotoUrl] = useState<string | null>(initialMember?.photoUrl ?? null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [lgas, setLgas] = useState<OrgUnit[]>([]);
  const [wards, setWards] = useState<OrgUnit[]>([]);
  const [pollingUnits, setPollingUnits] = useState<OrgUnit[]>([]);
  const lgaInitialized = useRef(false);
  const wardInitialized = useRef(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<OrgUnit[]>('/organization/lgas').then(setLgas).catch(() => setLgas([]));
  }, []);

  // First run (including a pre-filled edit value) only loads wards for the
  // current LGA; only a genuine, later change by the user clears the
  // downstream ward/polling-unit selection.
  useEffect(() => {
    if (!form.lgaId) {
      setWards([]);
      lgaInitialized.current = true;
      return;
    }
    api
      .get<OrgUnit[]>(`/organization/wards?lgaId=${form.lgaId}`)
      .then(setWards)
      .catch(() => setWards([]));
    if (!lgaInitialized.current) {
      lgaInitialized.current = true;
    } else {
      setForm((f) => ({ ...f, wardId: '', pollingUnitId: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.lgaId]);

  useEffect(() => {
    if (!form.wardId) {
      setPollingUnits([]);
      wardInitialized.current = true;
      return;
    }
    api
      .get<OrgUnit[]>(`/organization/polling-units?wardId=${form.wardId}`)
      .then(setPollingUnits)
      .catch(() => setPollingUnits([]));
    if (!wardInitialized.current) {
      wardInitialized.current = true;
    } else {
      setForm((f) => ({ ...f, pollingUnitId: '' }));
    }
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

  function handleCapturedPhoto(file: File) {
    setPhotoFile(file);
    setCameraOpen(false);
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

      const payload = {
        firstName: form.firstName,
        middleName: form.middleName || undefined,
        surname: form.surname,
        gender: form.gender,
        dateOfBirth: new Date(form.dateOfBirth).toISOString(),
        phone: form.phone,
        email: form.email || undefined,
        address: form.address || undefined,
        occupation: form.occupation || undefined,
        educationLevel: form.educationLevel || undefined,
        educationLevelOther: form.educationLevel === 'OTHER' ? form.educationLevelOther : undefined,
        // Blank means "leave unchanged" in edit mode (the field may be
        // masked/empty even though a value is on file) — never sent as an
        // explicit empty-string overwrite.
        nin: form.nin || undefined,
        pvcNumber: form.pvcNumber || undefined,
        pollingUnitId: form.pollingUnitId,
        ...(photoUrl ? { photoUrl } : {}),
      };

      if (mode === 'create') {
        const member = await api.post<{ id: string }>('/members', payload);
        showToast('Member registered successfully.', 'success');
        router.push(`/members/${member.id}`);
      } else {
        await api.patch(`/members/${memberId}`, payload);
        showToast('Member updated successfully.', 'success');
        router.push(`/members/${memberId}`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Unable to ${mode === 'create' ? 'register' : 'update'} this member. Please try again.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const ninHasExistingValue = mode === 'edit' && !!initialMember?.hasNin;
  const ninIsRevealed = mode === 'edit' && initialMember?.nin !== undefined;

  return (
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
          <Input
            required
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="08012345678"
          />
          <FieldHint>Nigerian number, e.g. 08012345678 or +2348012345678.</FieldHint>
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

      <SectionCard step="03" title="Education">
        <div>
          <Label>Level of Education</Label>
          <Select
            value={form.educationLevel}
            onChange={(e) => update('educationLevel', e.target.value as EducationLevel | '')}
          >
            <option value="">Not specified</option>
            {EDUCATION_LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {form.educationLevel === 'OTHER' && (
          <div className="sm:col-span-2">
            <Label required>Please specify</Label>
            <Input
              required
              maxLength={100}
              value={form.educationLevelOther}
              onChange={(e) => update('educationLevelOther', e.target.value)}
              placeholder="e.g. Vocational certificate"
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        step="04"
        title="Identification"
        description="NIN is highly sensitive — only a Super Admin can view a stored NIN."
      >
        <div>
          <Label>National Identification Number (NIN)</Label>
          <Input
            inputMode="numeric"
            maxLength={11}
            value={form.nin}
            onChange={(e) => update('nin', e.target.value.replace(/\D/g, ''))}
            placeholder={ninHasExistingValue && !ninIsRevealed ? 'On file — restricted' : '11-digit NIN'}
            disabled={ninHasExistingValue && !ninIsRevealed}
          />
          {ninHasExistingValue && !ninIsRevealed ? (
            <FieldHint>
              <span className="inline-flex items-center gap-1 text-slate-500">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                A NIN is on file for this member. Only a Super Admin can view or replace it here.
              </span>
            </FieldHint>
          ) : (
            <FieldHint>Optional. Exactly 11 digits. Never shown to non-Super Admin roles.</FieldHint>
          )}
        </div>
        <div>
          <Label>PVC Identifier</Label>
          <Input
            maxLength={25}
            value={form.pvcNumber}
            onChange={(e) => update('pvcNumber', e.target.value.toUpperCase())}
            placeholder="Permanent Voter's Card ID"
          />
          <FieldHint>Optional. Must be unique to this member.</FieldHint>
        </div>
      </SectionCard>

      <SectionCard
        step="05"
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

      <SectionCard step="06" title="Photo" description="Upload an existing image, or capture one live.">
        <div className="sm:col-span-3 flex flex-wrap items-center gap-4">
          <Avatar
            name={`${form.firstName} ${form.surname}`.trim() || '?'}
            photoUrl={photoPreview ?? existingPhotoUrl}
            size="lg"
          />
          <div className="flex flex-wrap gap-2">
            <label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-300 hover:bg-brand-50">
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload Photo
              </span>
            </label>
            <Button type="button" variant="secondary" onClick={() => setCameraOpen(true)}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              Take Live Photo
            </Button>
          </div>
          <p className="w-full text-xs text-slate-400">JPEG, PNG, or WEBP. Max 5MB.</p>
        </div>
      </SectionCard>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting
            ? mode === 'create'
              ? 'Registering…'
              : 'Saving…'
            : mode === 'create'
              ? 'Register Member'
              : 'Save Changes'}
        </Button>
      </div>

      <CameraCapture open={cameraOpen} onCancel={() => setCameraOpen(false)} onUsePhoto={handleCapturedPhoto} />
    </form>
  );
}
