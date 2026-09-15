import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';

/**
 * Generic QR issuance/verification for members. The token is an opaque
 * random string carrying no personal information — it only ever resolves,
 * server-side, to a member id. Any module that needs "scan QR -> know who
 * this is" (attendance, distribution, future modules) calls
 * `resolveToken()` here rather than re-implementing QR logic.
 */
@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private generateOpaqueToken(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  async issueForMember(memberId: string): Promise<{ token: string; qrImageDataUrl: string }> {
    const token = this.generateOpaqueToken();

    await this.prisma.memberQRCode.upsert({
      where: { memberId },
      create: { memberId, token },
      update: { token, status: 'ACTIVE', revokedAt: null },
    });

    const qrImageDataUrl = await QRCode.toDataURL(token, { margin: 1, width: 320 });
    return { token, qrImageDataUrl };
  }

  async reissueForMember(memberId: string, actorId: string) {
    const result = await this.issueForMember(memberId);
    await this.auditService.record({
      actorId,
      action: AuditAction.MEMBER_QR_REISSUED,
      entityType: 'Member',
      entityId: memberId,
    });
    return result;
  }

  async revokeForMember(memberId: string, actorId: string): Promise<void> {
    await this.prisma.memberQRCode.update({
      where: { memberId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.auditService.record({
      actorId,
      action: AuditAction.MEMBER_QR_REVOKED,
      entityType: 'Member',
      entityId: memberId,
    });
  }

  /** Resolves a scanned token to a member id, or null if invalid/revoked. */
  async resolveToken(token: string): Promise<{ memberId: string } | null> {
    const record = await this.prisma.memberQRCode.findUnique({ where: { token } });
    if (!record || record.status !== 'ACTIVE') return null;
    return { memberId: record.memberId };
  }

  async getQrImageForMember(memberId: string): Promise<string | null> {
    const record = await this.prisma.memberQRCode.findUnique({ where: { memberId } });
    if (!record || record.status !== 'ACTIVE') return null;
    return QRCode.toDataURL(record.token, { margin: 1, width: 320 });
  }
}
