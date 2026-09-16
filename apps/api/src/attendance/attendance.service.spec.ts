import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

const ACTOR: AuthenticatedUser = {
  id: 'officer-1',
  email: 'officer@example.com',
  role: Role.POLLING_UNIT_OFFICER,
  senatorialDistrictId: null,
  lgaId: null,
  wardId: null,
  pollingUnitId: 'pu-1',
};

const MEMBER = {
  id: 'member-1',
  membershipId: 'PDP-GC-2026-000001',
  firstName: 'Aisha',
  middleName: null,
  surname: 'Mohammed',
  photoUrl: null,
  status: 'ACTIVE',
};

function makeDeps(eventStatus: string) {
  const prisma = {
    attendance: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };
  const auditService = { record: jest.fn() };
  const eventsService = {
    findOne: jest.fn().mockResolvedValue({ id: 'event-1', status: eventStatus }),
  };
  const verificationService = { resolveMember: jest.fn().mockResolvedValue(MEMBER) };
  return { prisma, auditService, eventsService, verificationService };
}

function duplicateKeyError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

describe('AttendanceService.checkIn', () => {
  it('refuses to record attendance for a DRAFT event', async () => {
    const { prisma, auditService, eventsService, verificationService } = makeDeps('DRAFT');
    const service = new AttendanceService(prisma as any, auditService as any, eventsService as any, verificationService as any);

    await expect(service.checkIn('event-1', { membershipId: 'x' }, ACTOR)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('refuses to record attendance for a COMPLETED event', async () => {
    const { prisma, auditService, eventsService, verificationService } = makeDeps('COMPLETED');
    const service = new AttendanceService(prisma as any, auditService as any, eventsService as any, verificationService as any);

    await expect(service.checkIn('event-1', { membershipId: 'x' }, ACTOR)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException when no member resolves from the given criteria', async () => {
    const { prisma, auditService, eventsService, verificationService } = makeDeps('ACTIVE');
    verificationService.resolveMember.mockResolvedValue(null);
    const service = new AttendanceService(prisma as any, auditService as any, eventsService as any, verificationService as any);

    await expect(service.checkIn('event-1', { membershipId: 'nope' }, ACTOR)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('records attendance and logs ATTENDANCE_RECORDED on first check-in', async () => {
    const { prisma, auditService, eventsService, verificationService } = makeDeps('ACTIVE');
    prisma.attendance.create.mockResolvedValue({ id: 'att-1', eventId: 'event-1', memberId: 'member-1' });
    const service = new AttendanceService(prisma as any, auditService as any, eventsService as any, verificationService as any);

    const result = await service.checkIn('event-1', { membershipId: MEMBER.membershipId }, ACTOR);

    expect(result.member.membershipId).toBe(MEMBER.membershipId);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTENDANCE_RECORDED' }),
    );
  });

  it('translates a duplicate check-in into a friendly ConflictException and audits the attempt', async () => {
    const { prisma, auditService, eventsService, verificationService } = makeDeps('ACTIVE');
    prisma.attendance.create.mockRejectedValue(duplicateKeyError());
    const service = new AttendanceService(prisma as any, auditService as any, eventsService as any, verificationService as any);

    await expect(
      service.checkIn('event-1', { membershipId: MEMBER.membershipId }, ACTOR),
    ).rejects.toThrow(ConflictException);

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTENDANCE_DUPLICATE_ATTEMPT' }),
    );
  });
});
