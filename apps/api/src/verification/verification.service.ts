import { Injectable } from '@nestjs/common';
import { Member } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { QrService } from '../qr/qr.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { VerifyMemberDto } from './dto/verify-member.dto';

export type VerificationFailureReason = 'NOT_FOUND' | 'QR_REVOKED' | 'AMBIGUOUS_SEARCH';

export interface VerificationResult {
  verified: boolean;
  reason?: VerificationFailureReason;
  member?: {
    id: string;
    membershipId: string;
    fullName: string;
    status: Member['status'];
    photoUrl: string | null;
    lga: string;
    ward: string;
    pollingUnit: string;
  };
}

const MEMBER_WITH_LOCATION = {
  include: { lga: true, ward: true, pollingUnit: true },
} as const;

/**
 * The single place that turns "a QR token / membership ID / search string"
 * into "which member is this". Attendance, distribution, and any future
 * module verify a person by calling this service rather than re-implementing
 * lookup logic of their own.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrService: QrService,
    private readonly auditService: AuditService,
  ) {}

  /** Resolves the underlying Member entity for use by other modules. Returns null if not found/revoked. */
  async resolveMember(dto: VerifyMemberDto): Promise<Member | null> {
    if (dto.token) {
      const resolved = await this.qrService.resolveToken(dto.token);
      if (!resolved) return null;
      return this.prisma.member.findFirst({
        where: { id: resolved.memberId, deletedAt: null },
      });
    }

    if (dto.membershipId) {
      return this.prisma.member.findFirst({
        where: { membershipId: dto.membershipId, deletedAt: null },
      });
    }

    return null;
  }

  /** UI-facing verification: controlled result, no unnecessary PII, always audit-logged. */
  async verify(dto: VerifyMemberDto, actor: AuthenticatedUser): Promise<VerificationResult> {
    let member: (Member & { lga: { name: string }; ward: { name: string }; pollingUnit: { name: string } }) | null = null;
    let reason: VerificationFailureReason | undefined;

    if (dto.token) {
      const resolved = await this.qrService.resolveToken(dto.token);
      if (!resolved) {
        reason = 'QR_REVOKED';
      } else {
        member = await this.prisma.member.findFirst({
          where: { id: resolved.memberId, deletedAt: null },
          ...MEMBER_WITH_LOCATION,
        });
      }
    } else if (dto.membershipId) {
      member = await this.prisma.member.findFirst({
        where: { membershipId: dto.membershipId, deletedAt: null },
        ...MEMBER_WITH_LOCATION,
      });
    } else if (dto.search) {
      const matches = await this.prisma.member.findMany({
        where: {
          deletedAt: null,
          OR: [
            { phone: { contains: dto.search } },
            { membershipId: { contains: dto.search, mode: 'insensitive' } },
          ],
        },
        ...MEMBER_WITH_LOCATION,
        take: 2,
      });
      if (matches.length === 1) {
        member = matches[0];
      } else if (matches.length > 1) {
        reason = 'AMBIGUOUS_SEARCH';
      }
    }

    if (!member) {
      reason = reason ?? 'NOT_FOUND';
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.MEMBER_VERIFIED,
        entityType: 'Member',
        metadata: { outcome: 'FAILED', reason, criteria: dto },
      });
      return { verified: false, reason };
    }

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.MEMBER_VERIFIED,
      entityType: 'Member',
      entityId: member.id,
      metadata: { outcome: 'SUCCESS' },
    });

    return {
      verified: true,
      member: {
        id: member.id,
        membershipId: member.membershipId,
        fullName: [member.firstName, member.middleName, member.surname].filter(Boolean).join(' '),
        status: member.status,
        photoUrl: member.photoUrl,
        lga: member.lga.name,
        ward: member.ward.name,
        pollingUnit: member.pollingUnit.name,
      },
    };
  }
}
