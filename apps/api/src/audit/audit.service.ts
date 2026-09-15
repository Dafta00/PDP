import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export enum AuditAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',

  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED = 'USER_STATUS_CHANGED',

  ORG_UNIT_CREATED = 'ORG_UNIT_CREATED',
  ORG_UNIT_UPDATED = 'ORG_UNIT_UPDATED',
  ORG_UNIT_DELETED = 'ORG_UNIT_DELETED',

  MEMBER_CREATED = 'MEMBER_CREATED',
  MEMBER_UPDATED = 'MEMBER_UPDATED',
  MEMBER_STATUS_CHANGED = 'MEMBER_STATUS_CHANGED',
  MEMBER_VERIFIED = 'MEMBER_VERIFIED',
  MEMBER_QR_REVOKED = 'MEMBER_QR_REVOKED',
  MEMBER_QR_REISSUED = 'MEMBER_QR_REISSUED',

  EVENT_CREATED = 'EVENT_CREATED',
  EVENT_UPDATED = 'EVENT_UPDATED',
  EVENT_STATUS_CHANGED = 'EVENT_STATUS_CHANGED',
  ATTENDANCE_RECORDED = 'ATTENDANCE_RECORDED',
  ATTENDANCE_DUPLICATE_ATTEMPT = 'ATTENDANCE_DUPLICATE_ATTEMPT',

  RESOURCE_CREATED = 'RESOURCE_CREATED',
  RESOURCE_RESTOCKED = 'RESOURCE_RESTOCKED',
  RESOURCE_ALLOCATION_CREATED = 'RESOURCE_ALLOCATION_CREATED',
  RESOURCE_ALLOCATION_REJECTED = 'RESOURCE_ALLOCATION_REJECTED',
  RESOURCE_TRANSACTION_RECORDED = 'RESOURCE_TRANSACTION_RECORDED',
  RESOURCE_TRANSACTION_REJECTED = 'RESOURCE_TRANSACTION_REJECTED',

  DISTRIBUTION_CREATED = 'DISTRIBUTION_CREATED',
  DISTRIBUTION_STATUS_CHANGED = 'DISTRIBUTION_STATUS_CHANGED',
  ALLOCATION_CREATED = 'ALLOCATION_CREATED',
  RECEIPT_CONFIRMED = 'RECEIPT_CONFIRMED',
  RECEIPT_REJECTED = 'RECEIPT_REJECTED',
  RECEIPT_REVERSED = 'RECEIPT_REVERSED',

  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  DOCUMENT_UPDATED = 'DOCUMENT_UPDATED',
  DOCUMENT_DELETED = 'DOCUMENT_DELETED',
  RESTRICTED_DOCUMENT_DOWNLOADED = 'RESTRICTED_DOCUMENT_DOWNLOADED',
}

interface RecordEntryInput {
  actorId?: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Immutable audit trail. No update/delete is exposed anywhere in the app —
 * every module that mutates state calls `record()` from here rather than
 * writing to AuditLog directly.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordEntryInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata as any,
      },
    });
  }

  async list(params: { skip: number; take: number; action?: string; entityType?: string }) {
    const where = {
      ...(params.action ? { action: params.action } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
