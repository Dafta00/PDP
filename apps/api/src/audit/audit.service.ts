import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

export enum AuditAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',

  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED = 'USER_STATUS_CHANGED',
  USER_SCOPE_CHANGED = 'USER_SCOPE_CHANGED',
  USER_MANAGEMENT_DENIED = 'USER_MANAGEMENT_DENIED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  ROLE_PERMISSIONS_UPDATED = 'ROLE_PERMISSIONS_UPDATED',

  CAMPAIGN_CREATED = 'CAMPAIGN_CREATED',
  CAMPAIGN_UPDATED = 'CAMPAIGN_UPDATED',
  CAMPAIGN_USER_CREATED = 'CAMPAIGN_USER_CREATED',
  CAMPAIGN_USER_UPDATED = 'CAMPAIGN_USER_UPDATED',
  CAMPAIGN_ROLE_ASSIGNED = 'CAMPAIGN_ROLE_ASSIGNED',
  CAMPAIGN_SCOPE_ASSIGNED = 'CAMPAIGN_SCOPE_ASSIGNED',
  CAMPAIGN_MANAGEMENT_DENIED = 'CAMPAIGN_MANAGEMENT_DENIED',
  CAMPAIGN_TEAM_CREATED = 'CAMPAIGN_TEAM_CREATED',
  CAMPAIGN_TEAM_UPDATED = 'CAMPAIGN_TEAM_UPDATED',
  CAMPAIGN_VOLUNTEER_CREATED = 'CAMPAIGN_VOLUNTEER_CREATED',
  CAMPAIGN_VOLUNTEER_UPDATED = 'CAMPAIGN_VOLUNTEER_UPDATED',
  CAMPAIGN_EVENT_CREATED = 'CAMPAIGN_EVENT_CREATED',
  CAMPAIGN_EVENT_UPDATED = 'CAMPAIGN_EVENT_UPDATED',
  CAMPAIGN_ATTENDANCE_RECORDED = 'CAMPAIGN_ATTENDANCE_RECORDED',
  CAMPAIGN_ATTENDANCE_UPDATED = 'CAMPAIGN_ATTENDANCE_UPDATED',
  CAMPAIGN_TASK_CREATED = 'CAMPAIGN_TASK_CREATED',
  CAMPAIGN_TASK_ASSIGNED = 'CAMPAIGN_TASK_ASSIGNED',
  CAMPAIGN_TASK_UPDATED = 'CAMPAIGN_TASK_UPDATED',
  CAMPAIGN_TASK_COMPLETED = 'CAMPAIGN_TASK_COMPLETED',
  CAMPAIGN_RESOURCE_ALLOCATED = 'CAMPAIGN_RESOURCE_ALLOCATED',
  CAMPAIGN_ACTIVITY_RECORDED = 'CAMPAIGN_ACTIVITY_RECORDED',
  CAMPAIGN_REPORT_GENERATED = 'CAMPAIGN_REPORT_GENERATED',
  CAMPAIGN_PERMISSION_GRANTED = 'CAMPAIGN_PERMISSION_GRANTED',
  CAMPAIGN_PERMISSION_REVOKED = 'CAMPAIGN_PERMISSION_REVOKED',

  ORG_UNIT_CREATED = 'ORG_UNIT_CREATED',
  ORG_UNIT_UPDATED = 'ORG_UNIT_UPDATED',
  ORG_UNIT_DELETED = 'ORG_UNIT_DELETED',

  MEMBER_CREATED = 'MEMBER_CREATED',
  MEMBER_UPDATED = 'MEMBER_UPDATED',
  MEMBER_STATUS_CHANGED = 'MEMBER_STATUS_CHANGED',
  MEMBER_VERIFIED = 'MEMBER_VERIFIED',
  MEMBER_QR_REVOKED = 'MEMBER_QR_REVOKED',
  MEMBER_QR_REISSUED = 'MEMBER_QR_REISSUED',
  MEMBER_NIN_VIEWED = 'MEMBER_NIN_VIEWED',
  MEMBER_DUPLICATE_NIN_ATTEMPT = 'MEMBER_DUPLICATE_NIN_ATTEMPT',
  MEMBER_DUPLICATE_PVC_ATTEMPT = 'MEMBER_DUPLICATE_PVC_ATTEMPT',
  MEMBER_PHOTO_CHANGED = 'MEMBER_PHOTO_CHANGED',

  MESSAGE_SENT = 'MESSAGE_SENT',
  MESSAGE_READ = 'MESSAGE_READ',
  MESSAGE_ATTACHMENT_ACCESSED = 'MESSAGE_ATTACHMENT_ACCESSED',
  MESSAGE_AUTHORIZATION_DENIED = 'MESSAGE_AUTHORIZATION_DENIED',

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

  async list(
    params: { skip: number; take: number; action?: string; entityType?: string; entityId?: string },
    viewer?: AuthenticatedUser,
  ) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.action ? { action: params.action } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...this.viewerScopeWhere(viewer),
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

  /**
   * Audit entries have no geography of their own (the entity they describe
   * might be a Member, Event, User, etc., each shaped differently), so exact
   * per-entity scoping isn't practical here. Instead, a SENATORIAL_ADMIN
   * sees entries whose *actor* belongs to their own district — meaningfully
   * closing the state-wide visibility gap without a bespoke join per entity
   * type. SUPER_ADMIN/STATE_ADMIN remain unrestricted, matching every other
   * "all audit logs" capability in the spec.
   */
  private viewerScopeWhere(viewer?: AuthenticatedUser): Prisma.AuditLogWhereInput {
    if (!viewer || viewer.role === Role.SUPER_ADMIN || viewer.role === Role.STATE_ADMIN) return {};

    if (viewer.role === Role.SENATORIAL_ADMIN && viewer.senatorialDistrictId) {
      const districtId = viewer.senatorialDistrictId;
      return {
        actor: {
          OR: [
            { senatorialDistrictId: districtId },
            { lga: { senatorialDistrictId: districtId } },
            { ward: { lga: { senatorialDistrictId: districtId } } },
            { pollingUnit: { ward: { lga: { senatorialDistrictId: districtId } } } },
          ],
        },
      };
    }

    return { id: '__no_access__' };
  }
}
