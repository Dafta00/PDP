import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignAuthorizationService, CampaignMembershipLike } from './authorization/campaign-authorization.service';
import { RecordCampaignAttendanceDto } from './dto/attendance.dto';

const ATTENDANCE_SELECT = {
  id: true,
  eventId: true,
  attendeeType: true,
  memberId: true,
  member: { select: { id: true, firstName: true, surname: true } },
  volunteerId: true,
  volunteer: { select: { id: true, fullName: true } },
  guestName: true,
  checkInAt: true,
  checkOutAt: true,
  status: true,
  verificationMethod: true,
  recordedById: true,
  createdAt: true,
};

@Injectable()
export class CampaignAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  private async loadEventInScope(campaignId: string, eventId: string, actorMembership: CampaignMembershipLike) {
    const event = await this.prisma.campaignEvent.findUnique({ where: { id: eventId } });
    if (!event || event.campaignId !== campaignId) throw new NotFoundException('Campaign event not found.');
    await this.campaignAuthorization.assertCanAccessCampaignScope(actorMembership, event);
    return event;
  }

  async record(
    campaignId: string,
    eventId: string,
    dto: RecordCampaignAttendanceDto,
    actor: AuthenticatedUser,
    actorMembership: CampaignMembershipLike,
  ) {
    await this.loadEventInScope(campaignId, eventId, actorMembership);

    if (dto.attendeeType === 'MEMBER' && !dto.memberId) throw new BadRequestException('memberId is required for a MEMBER attendee.');
    if (dto.attendeeType === 'VOLUNTEER' && !dto.volunteerId) throw new BadRequestException('volunteerId is required for a VOLUNTEER attendee.');
    if (dto.attendeeType === 'GUEST' && !dto.guestName) throw new BadRequestException('guestName is required for a GUEST attendee.');

    const attendance = await this.prisma.campaignAttendance.create({
      data: {
        eventId,
        attendeeType: dto.attendeeType,
        memberId: dto.attendeeType === 'MEMBER' ? dto.memberId : undefined,
        volunteerId: dto.attendeeType === 'VOLUNTEER' ? dto.volunteerId : undefined,
        guestName: dto.attendeeType === 'GUEST' ? dto.guestName : undefined,
        verificationMethod: dto.verificationMethod ?? 'SEARCH',
        recordedById: actorMembership.id,
      },
      select: ATTENDANCE_SELECT,
    });

    await this.prisma.campaignEvent.update({
      where: { id: eventId },
      data: { actualAttendance: { increment: 1 } },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_ATTENDANCE_RECORDED,
      entityType: 'CampaignAttendance',
      entityId: attendance.id,
      metadata: { campaignId, eventId, attendeeType: dto.attendeeType },
    });

    return attendance;
  }

  async findAll(campaignId: string, eventId: string, actorMembership: CampaignMembershipLike) {
    await this.loadEventInScope(campaignId, eventId, actorMembership);
    return this.prisma.campaignAttendance.findMany({
      where: { eventId },
      select: ATTENDANCE_SELECT,
      orderBy: { checkInAt: 'desc' },
    });
  }

  async checkOut(campaignId: string, eventId: string, attendanceId: string, actor: AuthenticatedUser, actorMembership: CampaignMembershipLike) {
    await this.loadEventInScope(campaignId, eventId, actorMembership);
    const existing = await this.prisma.campaignAttendance.findUnique({ where: { id: attendanceId } });
    if (!existing || existing.eventId !== eventId) throw new NotFoundException('Attendance record not found.');

    const attendance = await this.prisma.campaignAttendance.update({
      where: { id: attendanceId },
      data: { checkOutAt: new Date(), status: 'CHECKED_OUT' },
      select: ATTENDANCE_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_ATTENDANCE_UPDATED,
      entityType: 'CampaignAttendance',
      entityId: attendanceId,
      metadata: { campaignId, eventId, action: 'check-out' },
    });

    return attendance;
  }
}
