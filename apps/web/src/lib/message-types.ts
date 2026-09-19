export interface MessageParticipant {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export interface MessageSummary {
  id: string;
  subject: string;
  createdAt: string;
  readAt: string | null;
  parentMessageId: string | null;
  sender: MessageParticipant;
  recipient: MessageParticipant;
  _count: { attachments: number };
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface MessageDetail {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  parentMessageId: string | null;
  senderId: string;
  recipientId: string;
  sender: MessageParticipant;
  recipient: MessageParticipant;
  attachments: MessageAttachment[];
}

export interface MessageContact {
  id: string;
  fullName: string;
  email: string;
  role: string;
}
