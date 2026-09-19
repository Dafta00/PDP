import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryMessageDto } from './dto/query-message.dto';

export const MESSAGE_ATTACHMENT_STORAGE_DIR = path.join(process.cwd(), 'message-attachments');
// Created eagerly at module-load time — mirrors how `uploads/`/
// `document-storage/` already exist in the repo, but a brand-new checkout
// won't have this one yet, and multer's diskStorage needs it to exist
// before the first upload.
fs.mkdirSync(MESSAGE_ATTACHMENT_STORAGE_DIR, { recursive: true });

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
];
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 3;

const PARTICIPANT_SELECT = { id: true, fullName: true, email: true, role: true } satisfies Prisma.UserSelect;

const MESSAGE_SUMMARY_SELECT = {
  id: true,
  subject: true,
  createdAt: true,
  readAt: true,
  parentMessageId: true,
  sender: { select: PARTICIPANT_SELECT },
  recipient: { select: PARTICIPANT_SELECT },
  _count: { select: { attachments: true } },
} satisfies Prisma.MessageSelect;

const MESSAGE_DETAIL_SELECT = {
  id: true,
  subject: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  readAt: true,
  parentMessageId: true,
  senderId: true,
  recipientId: true,
  sender: { select: PARTICIPANT_SELECT },
  recipient: { select: PARTICIPANT_SELECT },
  attachments: { select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true } },
} satisfies Prisma.MessageSelect;

function toActorLike(user: {
  id: string;
  role: AuthenticatedUser['role'];
  senatorialDistrictId: string | null;
  lgaId: string | null;
  wardId: string | null;
  pollingUnitId: string | null;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: '',
    role: user.role,
    senatorialDistrictId: user.senatorialDistrictId,
    lgaId: user.lgaId,
    wardId: user.wardId,
    pollingUnitId: user.pollingUnitId,
  };
}

/**
 * Admin-only internal messaging. Every read/write here re-derives
 * authorization from the database (sender/recipient ids, current scope) —
 * never trusts a client-submitted id as proof of eligibility. Members never
 * appear anywhere in this service; both parties are always administrative
 * Users.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orgScope: OrgScopeService,
  ) {}

  /** Administrative users the actor is currently authorized to message — the same check `create` re-runs server-side. */
  async listContacts(actor: AuthenticatedUser) {
    const users = await this.prisma.user.findMany({
      where: { id: { not: actor.id }, status: UserStatus.ACTIVE },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        senatorialDistrictId: true,
        lgaId: true,
        wardId: true,
        pollingUnitId: true,
      },
    });

    const eligible = await Promise.all(
      users.map(async (user) => ({
        user,
        eligible: await this.orgScope.canCommunicateWith(actor, toActorLike(user)),
      })),
    );

    return eligible
      .filter((entry) => entry.eligible)
      .map(({ user }) => ({ id: user.id, fullName: user.fullName, email: user.email, role: user.role }));
  }

  async create(dto: CreateMessageDto, files: Express.Multer.File[], actor: AuthenticatedUser) {
    if (dto.recipientId === actor.id) {
      throw new BadRequestException('You cannot send a message to yourself.');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.recipientId },
      select: {
        id: true,
        role: true,
        senatorialDistrictId: true,
        lgaId: true,
        wardId: true,
        pollingUnitId: true,
      },
    });
    if (!recipient) throw new NotFoundException('Recipient not found.');

    if (dto.parentMessageId) {
      const parent = await this.prisma.message.findUnique({
        where: { id: dto.parentMessageId },
        select: { senderId: true, recipientId: true },
      });
      if (!parent || (parent.senderId !== actor.id && parent.recipientId !== actor.id)) {
        throw new NotFoundException('Message not found.');
      }
    }

    const authorized = await this.orgScope.canCommunicateWith(actor, toActorLike(recipient));
    if (!authorized) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.MESSAGE_AUTHORIZATION_DENIED,
        entityType: 'Message',
        entityId: null,
        metadata: { attemptedRecipientId: dto.recipientId },
      });
      throw new ForbiddenException('You are not authorized to message this user.');
    }

    const message = await this.prisma.message.create({
      data: {
        senderId: actor.id,
        recipientId: dto.recipientId,
        subject: dto.subject,
        body: dto.body,
        parentMessageId: dto.parentMessageId,
        attachments: files?.length
          ? {
              create: files.map((file) => ({
                fileName: file.originalname,
                storedFileName: file.filename,
                mimeType: file.mimetype,
                fileSize: file.size,
              })),
            }
          : undefined,
      },
      select: MESSAGE_DETAIL_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.MESSAGE_SENT,
      entityType: 'Message',
      entityId: message.id,
      metadata: { recipientId: dto.recipientId, attachmentCount: files?.length ?? 0 },
    });

    return message;
  }

  async findAll(query: QueryMessageDto, actor: AuthenticatedUser) {
    const box = query.box ?? 'inbox';
    const page = Math.max(parseInt(query.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(query.pageSize ?? '25', 10) || 25, 1), 100);

    const where: Prisma.MessageWhereInput =
      box === 'sent'
        ? { senderId: actor.id, deletedBySender: false }
        : { recipientId: actor.id, deletedByRecipient: false };

    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: 'insensitive' } },
        { body: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        select: MESSAGE_SUMMARY_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.message.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async unreadCount(actor: AuthenticatedUser) {
    const count = await this.prisma.message.count({
      where: { recipientId: actor.id, readAt: null, deletedByRecipient: false },
    });
    return { count };
  }

  /**
   * IDOR/BOLA guard: a message is reported as "not found" — never
   * "forbidden" — to a user who is neither its sender nor its recipient, so
   * a guessed/enumerated id can't even confirm the message exists.
   */
  private async findParticipantMessage(id: string, actor: AuthenticatedUser) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      select: MESSAGE_DETAIL_SELECT,
    });
    if (!message || (message.senderId !== actor.id && message.recipientId !== actor.id)) {
      if (message) {
        await this.auditService.record({
          actorId: actor.id,
          action: AuditAction.MESSAGE_AUTHORIZATION_DENIED,
          entityType: 'Message',
          entityId: id,
          metadata: { reason: 'not_a_participant' },
        });
      }
      throw new NotFoundException('Message not found.');
    }
    return message;
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const message = await this.findParticipantMessage(id, actor);

    if (message.recipientId === actor.id && !message.readAt) {
      await this.prisma.message.update({ where: { id }, data: { readAt: new Date() } });
      message.readAt = new Date();
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.MESSAGE_READ,
        entityType: 'Message',
        entityId: id,
      });
    }

    return message;
  }

  async getAttachmentForDownload(messageId: string, attachmentId: string, actor: AuthenticatedUser) {
    await this.findParticipantMessage(messageId, actor);

    const attachment = await this.prisma.messageAttachment.findFirst({
      where: { id: attachmentId, messageId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.MESSAGE_ATTACHMENT_ACCESSED,
      entityType: 'MessageAttachment',
      entityId: attachment.id,
    });

    return {
      filePath: path.join(MESSAGE_ATTACHMENT_STORAGE_DIR, attachment.storedFileName),
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }
}
