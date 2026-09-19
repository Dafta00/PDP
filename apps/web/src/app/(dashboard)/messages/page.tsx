'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MailPlus, MessageSquare, Paperclip, Search } from 'lucide-react';
import { api } from '@/lib/api-client';
import { MessageSummary } from '@/lib/message-types';
import { PaginatedResult } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TabSwitcher } from '@/components/ui/tabs';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type Box = 'inbox' | 'sent';

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const box: Box = searchParams.get('box') === 'sent' ? 'sent' : 'inbox';
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['messages', box, search],
    queryFn: () => {
      const params = new URLSearchParams({ box });
      if (search) params.set('search', search);
      return api.get<PaginatedResult<MessageSummary>>(`/messages?${params.toString()}`);
    },
  });

  function setBox(next: Box) {
    router.push(`/messages${next === 'sent' ? '?box=sent' : ''}`);
  }

  return (
    <>
      <Topbar title="Messages" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Messages"
          description="Administrative communication between authorized staff — not a member-facing channel."
          actions={
            <Link href="/messages/compose">
              <Button>
                <MailPlus className="h-4 w-4" aria-hidden="true" />
                Compose
              </Button>
            </Link>
          }
        />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabSwitcher
            tabs={[
              { key: 'inbox', label: 'Inbox' },
              { key: 'sent', label: 'Sent' },
            ]}
            value={box}
            onChange={setBox}
            className="max-w-xs"
          />
          <Input
            icon={Search}
            placeholder="Search subject or body"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
        </div>

        <TableContainer>
          <THead>
            <Th>{box === 'inbox' ? 'Sender' : 'Recipient'}</Th>
            <Th>Subject</Th>
            <Th>Date</Th>
            <Th>Status</Th>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={4} />}
            {error && (
              <tr>
                <td colSpan={4}>
                  <ErrorState description="Unable to load messages." onRetry={() => refetch()} />
                </td>
              </tr>
            )}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={MessageSquare}
                    title={box === 'inbox' ? 'No messages yet' : 'No sent messages'}
                    description={
                      box === 'inbox'
                        ? 'Messages from authorized administrators will appear here.'
                        : 'Compose a message to an authorized administrator.'
                    }
                  />
                </td>
              </tr>
            )}
            {data?.items.map((m) => {
              const unread = box === 'inbox' && !m.readAt;
              const participant = box === 'inbox' ? m.sender : m.recipient;
              return (
                <tr
                  key={m.id}
                  onClick={() => router.push(`/messages/${m.id}`)}
                  className={cn('cursor-pointer hover:bg-slate-50', unread && 'bg-brand-50/40')}
                >
                  <Td>
                    <span className={cn(unread ? 'font-semibold text-slate-900' : 'text-slate-700')}>
                      {participant.fullName}
                    </span>
                  </Td>
                  <Td>
                    <span className={cn('inline-flex items-center gap-1.5', unread ? 'font-semibold text-slate-900' : 'text-slate-700')}>
                      {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />}
                      {m.subject}
                      {m._count.attachments > 0 && (
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      )}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(m.createdAt)}</Td>
                  <Td>
                    {box === 'inbox' ? (
                      <span className={cn('text-xs font-medium', unread ? 'text-brand-700' : 'text-slate-400')}>
                        {unread ? 'Unread' : 'Read'}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">
                        {m.readAt ? 'Read' : 'Delivered'}
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </TableContainer>
      </div>
    </>
  );
}
