import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrgScopeService } from './org-scope.service';
import { AuthenticatedUser } from '../types/authenticated-user';

function makeUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'u@example.com',
    role: Role.WARD_ADMIN,
    lgaId: null,
    wardId: null,
    pollingUnitId: null,
    ...overrides,
  };
}

describe('OrgScopeService', () => {
  const prismaMock = {
    ward: { findUnique: jest.fn() },
    pollingUnit: { findUnique: jest.fn() },
  };
  const service = new OrgScopeService(prismaMock as any);

  describe('memberScopeWhere', () => {
    it('gives SUPER_ADMIN unrestricted access', () => {
      const user = makeUser({ role: Role.SUPER_ADMIN });
      expect(service.memberScopeWhere(user)).toEqual({});
    });

    it('restricts LGA_ADMIN to their assigned LGA', () => {
      const user = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });
      expect(service.memberScopeWhere(user)).toEqual({ lgaId: 'lga-1' });
    });

    it('restricts WARD_ADMIN to their assigned ward', () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });
      expect(service.memberScopeWhere(user)).toEqual({ wardId: 'ward-1' });
    });

    it('restricts POLLING_UNIT_OFFICER to their assigned polling unit', () => {
      const user = makeUser({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1' });
      expect(service.memberScopeWhere(user)).toEqual({ pollingUnitId: 'pu-1' });
    });

    it('denies all access to a scoped role with no assigned unit', () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: null });
      expect(service.memberScopeWhere(user)).toEqual({ id: '__no_access__' });
    });
  });

  describe('assertCanAccessOrgUnit', () => {
    it('allows a WARD_ADMIN to access their own ward', () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });
      expect(() =>
        service.assertCanAccessOrgUnit(user, { wardId: 'ward-1', lgaId: 'lga-1', pollingUnitId: 'pu-1' }),
      ).not.toThrow();
    });

    it('throws when a WARD_ADMIN targets a different ward', () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });
      expect(() =>
        service.assertCanAccessOrgUnit(user, { wardId: 'ward-2', lgaId: 'lga-1', pollingUnitId: 'pu-2' }),
      ).toThrow(ForbiddenException);
    });

    it('allows unrestricted roles to access any unit', () => {
      const user = makeUser({ role: Role.STATE_ADMIN });
      expect(() =>
        service.assertCanAccessOrgUnit(user, { wardId: 'anything', lgaId: 'anything', pollingUnitId: 'anything' }),
      ).not.toThrow();
    });
  });

  describe('eventScopeWhere', () => {
    beforeEach(() => jest.clearAllMocks());

    it('gives unrestricted roles no filter', async () => {
      const user = makeUser({ role: Role.SUPER_ADMIN });
      expect(await service.eventScopeWhere(user)).toEqual({});
    });

    it('lets an LGA_ADMIN see district-wide and their own LGA events', async () => {
      const user = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });
      const where = await service.eventScopeWhere(user);
      expect(where).toEqual({
        OR: [
          { targetLgaId: null, targetWardId: null, targetPollingUnitId: null },
          { targetLgaId: 'lga-1' },
        ],
      });
    });

    it("resolves a WARD_ADMIN's LGA so they also see LGA-wide events", async () => {
      prismaMock.ward.findUnique.mockResolvedValue({ lgaId: 'lga-1' });
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });
      const where = await service.eventScopeWhere(user);
      expect(where).toEqual({
        OR: [
          { targetLgaId: null, targetWardId: null, targetPollingUnitId: null },
          { targetLgaId: 'lga-1', targetWardId: null },
          { targetWardId: 'ward-1' },
        ],
      });
      expect(prismaMock.ward.findUnique).toHaveBeenCalledWith({
        where: { id: 'ward-1' },
        select: { lgaId: true },
      });
    });

    it('denies a scoped role with no assigned unit', async () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: null });
      expect(await service.eventScopeWhere(user)).toEqual({ id: '__no_access__' });
    });
  });
});
