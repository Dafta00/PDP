export type DocumentCategory = 'REPORT' | 'MEETING' | 'ADMINISTRATIVE' | 'POLICY' | 'FORM' | 'OTHER';

export interface DocumentItem {
  id: string;
  title: string;
  description: string | null;
  category: DocumentCategory;
  fileName: string;
  mimeType: string;
  fileSize: number;
  restrictedToAdmins: boolean;
  createdAt: string;
  uploadedBy: { id: string; fullName: string };
}
