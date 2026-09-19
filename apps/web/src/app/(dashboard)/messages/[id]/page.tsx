'use client';

import { FormEvent, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Download, Paperclip, Reply } from 'lucide-react';
import { api, ApiError, downloadFile } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { MessageDetail } from '@/lib/message-types';
import { Topbar } from '@/components/layout/topbar';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState } from '@/components/ui/states';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: message, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['message', params.id],
    queryFn: () => api.get<MessageDetail>(`/messages/${params.id}`),
  });

  if (isLoading) {
    return (
      <>
        <Topbar title="Message" />
        <LoadingState label="Loading message…" />
      </>
    );
  }

  if (loadError || !message) {
    return (
      <>
        <Topbar title="Message" />
        <ErrorState title="Message not found" onRetry={() => refetch()} />
      </>
    );
  }

  const otherParty = message.senderId === user?.id ? message.recipient : message.sender;
  const replySubject = message.subject.startsWith('Re: ') ? message.subject : `Re: ${message.subject}`;

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!message) return;
    setError(null);
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('recipientId', otherParty.id);
      fd.append('subject', replySubject);
      fd.append('body', replyBody);
      fd.append('parentMessageId', message.id);
      await api.upload('/messages', fd);
      showToast('Reply sent.', 'success');
      setReplying(false);
      setReplyBody('');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      router.push('/messages?box=sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send this reply. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleDownload(attachmentId: string, fileName: string) {
    try {
      await downloadFile(`/messages/${message!.id}/attachments/${attachmentId}`, fileName);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to download this attachment.', 'error');
    }
  }

  return (
    <>
      <Topbar title="Message" />
      <div className="p-4 sm:p-6">
        <Breadcrumb items={[{ label: 'Messages', href: '/messages' }, { label: message.subject }]} />

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base">{message.subject}</CardTitle>
            <div className="mt-2 space-y-1 text-sm text-slate-500">
              <p>
                <span className="font-medium text-slate-700">From:</span> {message.sender.fullName} (
                {message.sender.role.replaceAll('_', ' ')})
              </p>
              <p>
                <span className="font-medium text-slate-700">To:</span> {message.recipient.fullName} (
                {message.recipient.role.replaceAll('_', ' ')})
              </p>
              <p>{new Date(message.createdAt).toLocaleString()}</p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-slate-800">{message.body}</p>

            {message.attachments.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  Attachments
                </p>
                {message.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700">{a.fileName}</p>
                      <p className="text-xs text-slate-400">{formatBytes(a.fileSize)}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(a.id, a.fileName)}>
                      <Download className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 border-t border-slate-100 pt-4">
              {!replying ? (
                <Button variant="secondary" onClick={() => setReplying(true)}>
                  <Reply className="h-4 w-4" aria-hidden="true" />
                  Reply
                </Button>
              ) : (
                <form onSubmit={sendReply} className="space-y-3">
                  <textarea
                    autoFocus
                    required
                    rows={5}
                    maxLength={10000}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={`Reply to ${otherParty.fullName}…`}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500"
                  />
                  {error && (
                    <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {error}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setReplying(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={sending}>
                      {sending ? 'Sending…' : 'Send Reply'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
