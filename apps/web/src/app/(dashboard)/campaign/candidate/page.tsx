'use client';

import { FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserSquare2, Pencil } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useCampaignCtx } from '@/lib/campaign-context';
import { useToast } from '@/lib/toast-context';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/states';

export default function CandidateProfilePage() {
  const { user } = useAuth();
  const { campaign, loading } = useCampaignCtx();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'STATE_ADMIN';

  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function startEdit() {
    setBio(campaign?.candidateBio ?? '');
    setPhotoUrl(campaign?.candidatePhotoUrl ?? '');
    setEditing(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    setSubmitting(true);
    try {
      await api.patch(`/campaigns/${campaign.id}`, { candidateBio: bio, candidatePhotoUrl: photoUrl });
      showToast('Candidate profile updated.', 'success');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update profile.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !campaign) {
    return (
      <>
        <Topbar title="Candidate" />
        <LoadingState label="Loading candidate profile…" />
      </>
    );
  }

  return (
    <>
      <Topbar title="Candidate" />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <Card>
          <div className="relative overflow-hidden bg-brand-800">
            <div className="absolute inset-x-0 top-0 h-1 bg-party-red" aria-hidden="true" />
            <div className="flex flex-col items-center gap-4 px-6 py-8 text-center sm:flex-row sm:text-left">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-2 ring-white/30">
                {campaign.candidatePhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={campaign.candidatePhotoUrl} alt={campaign.candidateName} className="h-full w-full object-cover" />
                ) : (
                  <UserSquare2 className="h-12 w-12 text-white/60" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-200">
                  {campaign.party} {campaign.electionType.replaceAll('_', ' ')} Candidate — {campaign.electionYear}
                </p>
                <h1 className="font-heading text-2xl font-semibold text-white">
                  {campaign.candidateTitle ? `${campaign.candidateTitle} ` : ''}
                  {campaign.candidateName}
                </h1>
                <div className="mt-2">
                  <StatusBadge status={campaign.status} />
                </div>
              </div>
            </div>
          </div>
          <CardContent>
            <div className="flex items-center justify-between">
              <CardTitle>Biography</CardTitle>
              {canEdit && !editing && (
                <Button variant="secondary" size="sm" onClick={startEdit}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </Button>
              )}
            </div>

            {!editing ? (
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                {campaign.candidateBio || 'No biography has been added yet.'}
              </p>
            ) : (
              <form onSubmit={onSubmit} className="mt-3 space-y-3">
                <div>
                  <Label>Biography</Label>
                  <textarea
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    rows={6}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Photo URL</Label>
                  <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
