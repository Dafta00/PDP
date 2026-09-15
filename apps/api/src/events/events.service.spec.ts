import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EventsService } from './events.service';
import { EventTargetLevel } from './dto/create-event.dto';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

function makeUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'actor-1',
    email: 'actor@example.com',
    role: Role.WARD_ADMIN,
    lgaId: null,
    wardId: null,
    pollingUnitId: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    lGA: { findUnique: jest.fn() },
    ward: { findUnique: jest.fn() },
    pollingUnit: { findUnique: jest.fn() },
    event: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'event-1', ...data })) },
  };
  const auditService = { record: jest.fn() };
  const orgScope = new OrgScopeService(prisma as any);
  const service = new EventsService(prisma as any, auditService as any, orgScope);
  return { service, prisma, auditService };
}

const VALID_TIMES = { startTime: '2026-10-01T10:00:00.000Z', endTime: '2026-10-01T12:00:00.000Z' };

describe('EventsService.create', () => {
  it('rejects an end time that is not after the start time', async () => {
    const { service } = makeService();
    const actor = makeUser({ role: Role.SUPER_ADMIN });

    await expect(
      service.create(
        {
          title: 'Bad Event',
          location: 'HQ',
          targetLevel: EventTargetLevel.DISTRICT,
          startTime: '2026-10-01T12:00:00.000Z',
          endTime: '2026-10-01T10:00:00.000Z',
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('only lets top-level admins create a district-wide event', async () => {
    const { service } = makeService();
    const lgaAdmin = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });

    await expect(
      service.create({ title: 'District Meeting', location: 'HQ', targetLevel: EventTargetLevel.DISTRICT, ...VALID_TIMES }, lgaAdmin),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets a WARD_ADMIN create an event targeted at their own ward', async () => {
    const { service, prisma } = makeService();
    prisma.ward.findUnique.mockResolvedValue({ id: 'ward-1', lgaId: 'lga-1' });
    const wardAdmin = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });

    const event = await service.create(
      { title: 'Ward Meeting', location: 'Town Hall', targetLevel: EventTargetLevel.WARD, targetId: 'ward-1', ...VALID_TIMES },
      wardAdmin,
    );

    expect(event.targetWardId).toBe('ward-1');
    expect(event.targetLgaId).toBe('lga-1');
  });

  it('refuses a WARD_ADMIN creating an event targeted at a different ward', async () => {
    const { service, prisma } = makeService();
    prisma.ward.findUnique.mockResolvedValue({ id: 'ward-2', lgaId: 'lga-1' });
    const wardAdmin = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });

    await expect(
      service.create(
        { title: 'Other Ward Meeting', location: 'Town Hall', targetLevel: EventTargetLevel.WARD, targetId: 'ward-2', ...VALID_TIMES },
        wardAdmin,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a WARD_ADMIN creating an LGA-wide event even for their own LGA', async () => {
    const { service, prisma } = makeService();
    prisma.lGA.findUnique.mockResolvedValue({ id: 'lga-1' });
    const wardAdmin = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });

    await expect(
      service.create(
        { title: 'LGA Meeting', location: 'HQ', targetLevel: EventTargetLevel.LGA, targetId: 'lga-1', ...VALID_TIMES },
        wardAdmin,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
