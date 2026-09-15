'use client';

import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Search, Trash2, Upload } from 'lucide-react';
import { api, ApiError, downloadFile } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { DocumentCategory, DocumentItem } from '@/lib/document-types';
import { PaginatedResult } from '@/lib/types';
import { Topbar } from '@/components/layout/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { TableContainer, THead, TBody, Th, Td } from '@/components/ui/table';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const CAN_MANAGE = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN', 'LGA_ADMIN', 'WARD_ADMIN'];
const CATEGORY_OPTIONS: (DocumentCategory | 'ALL')[] = [
  'ALL',
  'REPORT',
  'MEETING',
  'ADMINISTRATIVE',
  'POLICY',
  'FORM',
  'OTHER',
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DocumentCategory | 'ALL'>('ALL');

  // upload form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('OTHER');
  const [restricted, setRestricted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['documents', search, category],
    queryFn: () => {
      const params = new URLSearchParams({ pageSize: '50' });
      if (search) params.set('search', search);
      if (category !== 'ALL') params.set('category', category);
      return api.get<PaginatedResult<DocumentItem>>(`/documents?${params.toString()}`);
    },
  });

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !file) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      if (description.trim()) formData.append('description', description.trim());
      formData.append('category', uploadCategory);
      formData.append('restrictedToAdmins', String(restricted));
      formData.append('file', file);
      await api.upload('/documents', formData);
      showToast('Document uploaded.', 'success');
      setTitle('');
      setDescription('');
      setRestricted(false);
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to upload this document.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDownload(doc: DocumentItem) {
    try {
      await downloadFile(`/documents/${doc.id}/download`, doc.fileName);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to download this document.', 'error');
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/documents/${deleteTarget.id}`);
      showToast('Document deleted.', 'success');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to delete this document.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <Topbar title="Documents" />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this document?"
        description={`"${deleteTarget?.title}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete Document"
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <div className="p-4 sm:p-6">
        <PageHeader title="Documents" description="Organizational reports, minutes, policies, and forms." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <Input
              icon={Search}
              placeholder="Search by title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory | 'ALL')}
              className="sm:max-w-[200px]"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALL' ? 'All categories' : c}
                </option>
              ))}
            </Select>
          </div>

          <TableContainer>
            <THead>
              <Th>Title</Th>
              <Th>Category</Th>
              <Th>Size</Th>
              <Th>Uploaded By</Th>
              <Th />
            </THead>
            <TBody>
              {isLoading && <TableSkeleton columns={5} />}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon={FileText} title="No documents found" />
                  </td>
                </tr>
              )}
              {data?.items.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-800">{doc.title}</p>
                    {doc.description && <p className="text-xs text-slate-500">{doc.description}</p>}
                    {doc.restrictedToAdmins && (
                      <span className="mt-1 inline-block rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700 ring-1 ring-inset ring-warning-200">
                        Restricted
                      </span>
                    )}
                  </Td>
                  <Td>{doc.category}</Td>
                  <Td className="text-slate-500">{formatSize(doc.fileSize)}</Td>
                  <Td>{doc.uploadedBy.fullName}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => onDownload(doc)}>
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Download
                      </Button>
                      {user &&
                        (CAN_MANAGE.includes(user.role) || user.id === doc.uploadedBy.id) && (
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(doc)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Delete
                          </Button>
                        )}
                    </div>
                  </Td>
                </tr>
              ))}
            </TBody>
          </TableContainer>
        </div>

        {user && CAN_MANAGE.includes(user.role) && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Document</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onUpload} className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                  >
                    {CATEGORY_OPTIONS.filter((c) => c !== 'ALL').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>File</Label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block text-sm text-slate-600"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={restricted}
                    onChange={(e) => setRestricted(e.target.checked)}
                  />
                  Restrict to top-level administrators only
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Uploading…' : 'Upload Document'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </>
  );
}
