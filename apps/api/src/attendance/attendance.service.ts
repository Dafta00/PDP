import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { VerificationService } from '../verification/verification.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CheckInDto } from './dto/check-in.dto';

const OPEN_FOR_CHECKIN_STATUSES = ['UPCOMING', 'ACTIVE'];

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventsService: EventsService,
    private readonly verificationService: VerificationService,
  ) {}

  async checkIn(eventId: string, dto: CheckInDto, actor: AuthenticatedUser) {
    const event = await this.eventsService.findOne(eventId, actor);

    if (!OPEN_FOR_CHECKIN_STATUSES.includes(event.status)) {
      throw new BadRequestException(
        `Attendance can't be recorded for an event that is ${event.status.toLowerCase()}.`,
      );
    }

    const member = await this.verificationService.resolveMember(dto);
    if (!member) {
      throw new NotFoundException('No member matches that QR code, membership ID, or search term.');
    }

    const method = dto.token ? 'QR' : dto.membershipId ? 'MEMBERSHIP_ID' : 'SEARCH';

    try {
      const attendance = await this.prisma.attendance.create({
        data: {
          eventId,
          memberId: member.id,
          method,
          recordedById: actor.id,
        },
      });

      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.ATTENDANCE_RECORDED,
        entityType: 'Attendance',
        entityId: attendance.id,
        metadata: { eventId, memberId: member.id, method },
      });

      return {
        attendance,
        member: {
          id: member.id,
          membershipId: member.membershipId,
          fullName: [member.firstName, member.middleName, member.surname].filter(Boolean).join(' '),
          photoUrl: member.photoUrl,
          status: member.status,
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await this.auditService.record({
          actorId: actor.id,
          action: AuditAction.ATTENDANCE_DUPLICATE_ATTEMPT,
          entityType: 'Event',
          entityId: eventId,
          metadata: { memberId: member.id },
        });
        throw new ConflictException('This member has already checked in to this event.');
      }
      throw error;
    }
  }

  async list(eventId: string, actor: AuthenticatedUser, params: { skip: number; take: number }) {
    await this.eventsService.findOne(eventId, actor); // validates existence + view permission

    const [items, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { eventId },
        include: {
          member: {
            select: { id: true, membershipId: true, firstName: true, middleName: true, surname: true },
          },
          recordedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { checkedInAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.attendance.count({ where: { eventId } }),
    ]);

    return { items, total };
  }
}
