'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Paperclip, Send, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { MessageContact } from '@/lib/message-types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, FieldHint } from '@/components/ui/input';

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_MB = 10;

export default function ComposeMessagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showToast = useToast();

  const [recipientId, setRecipientId] = useState(searchParams.get('to') ?? '');
  const [subject, setSubject] = useState(searchParams.get('subject') ?? '');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: contacts, isLoading: contactsLoading } = useQuery({
    queryKey: ['message-contacts'],
    queryFn: () => api.get<MessageContact[]>('/messages/contacts'),
  });

  useEffect(() => {
    // A recipient passed in via query string (e.g. "Reply") must still be a
    // currently-eligible contact — never trust the URL as authorization.
    if (recipientId && contacts && !contacts.some((c) => c.id === recipientId)) {
      setRecipientId('');
    }
  }, [contacts, recipientId]);

  function addAttachments(files: FileList | null) {
    if (!files) return;
    const next = [...attachments, ...Array.from(files)].slice(0, MAX_ATTACHMENTS);
    setAttachments(next);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('recipientId', recipientId);
      fd.append('subject', subject);
      fd.append('body', body);
      attachments.forEach((file) => fd.append('attachments', file));

      await api.upload('/messages', fd);
      showToast('Message sent.', 'success');
      router.push('/messages?box=sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send this message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar title="Compose Message" />
      <div className="p-4 sm:p-6">
        <Breadcrumb items={[{ label: 'Messages', href: '/messages' }, { label: 'Compose' }]} />
        <PageHeader title="Compose Message" description="Send a message to an authorized administrator within your reach." />

        <Card className="max-w-2xl">
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label required>Recipient</Label>
                <Select required value={recipientId} onChange={(e) => setRecipientId(e.target.value)} disabled={contactsLoading}>
                  <option value="">
                    {contactsLoading ? 'Loading contacts…' : 'Select a recipient'}
                  </option>
                  {contacts?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} — {c.role.replaceAll('_', ' ')}
                    </option>
                  ))}
                </Select>
                <FieldHint>
                  Only administrators within your reporting chain and scope are listed — this list is
                  authorized server-side, not merely hidden in the UI.
                </FieldHint>
                {!contactsLoading && contacts?.length === 0 && (
                  <FieldHint>No authorized recipients are currently available to you.</FieldHint>
                )}
              </div>

              <div>
                <Label required>Subject</Label>
                <Input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              <div>
                <Label required>Message</Label>
                <textarea
                  required
                  rows={8}
                  maxLength={10000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500"
                />
              </div>

              <div>
                <Label>Attachments</Label>
                <label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => addAttachments(e.target.files)}
                    disabled={attachments.length >= MAX_ATTACHMENTS}
                    className="hidden"
                  />
                  <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-300 hover:bg-brand-50">
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                    Attach File
                  </span>
                </label>
                <FieldHint>
                  Up to {MAX_ATTACHMENTS} files, {MAX_ATTACHMENT_MB}MB each.
                </FieldHint>
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((file, i) => (
                      <li key={`${file.name}-${i}`} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
                        <span className="truncate text-slate-700">{file.name}</span>
                        <button type="button" onClick={() => removeAttachment(i)} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${file.name}`}>
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

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
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
