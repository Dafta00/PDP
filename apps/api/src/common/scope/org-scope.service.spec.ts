import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrgScopeService } from './org-scope.service';
import { AuthenticatedUser } from '../types/authenticated-user';

function makeUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'u@example.com',
    role: Role.WARD_ADMIN,
    senatorialDistrictId: null,
    lgaId: null,
    wardId: null,
    pollingUnitId: null,
    ...overrides,
  };
}

describe('OrgScopeService', () => {
  const prismaMock = {
    lGA: { findUnique: jest.fn(), findMany: jest.fn() },
    ward: { findUnique: jest.fn(), findMany: jest.fn() },
    pollingUnit: { findUnique: jest.fn() },
    senatorialDistrict: { findUnique: jest.fn() },
  };
  const service = new OrgScopeService(prismaMock as any);

  beforeEach(() => jest.clearAllMocks());

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

    it('restricts SENATORIAL_ADMIN to LGAs within their assigned district', () => {
      const user = makeUser({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'district-1' });
      expect(service.memberScopeWhere(user)).toEqual({ lga: { senatorialDistrictId: 'district-1' } });
    });

    it('denies SENATORIAL_ADMIN with no assigned district', () => {
      const user = makeUser({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: null });
      expect(service.memberScopeWhere(user)).toEqual({ id: '__no_access__' });
    });

    it('denies all access to a scoped role with no assigned unit', () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: null });
      expect(service.memberScopeWhere(user)).toEqual({ id: '__no_access__' });
    });

    it("scopes DATA_ENTRY_OFFICER by whichever unit is configured, most specific first", () => {
      expect(
        service.memberScopeWhere(
          makeUser({ role: Role.DATA_ENTRY_OFFICER, lgaId: 'lga-1', pollingUnitId: 'pu-1', wardId: 'ward-1' }),
        ),
      ).toEqual({ pollingUnitId: 'pu-1' });

      expect(
        service.memberScopeWhere(makeUser({ role: Role.DATA_ENTRY_OFFICER, lgaId: 'lga-1', wardId: 'ward-1' })),
      ).toEqual({ wardId: 'ward-1' });

      expect(service.memberScopeWhere(makeUser({ role: Role.DATA_ENTRY_OFFICER, lgaId: 'lga-1' }))).toEqual({
        lgaId: 'lga-1',
      });

      expect(
        service.memberScopeWhere(makeUser({ role: Role.DATA_ENTRY_OFFICER, senatorialDistrictId: 'district-1' })),
      ).toEqual({ lga: { senatorialDistrictId: 'district-1' } });
    });

    it('denies an unconfigured DATA_ENTRY_OFFICER (no unit assigned at all)', () => {
      expect(service.memberScopeWhere(makeUser({ role: Role.DATA_ENTRY_OFFICER }))).toEqual({
        id: '__no_access__',
      });
    });

    it('ORs an additional UserScope-granted LGA in with the primary one', () => {
      const user = makeUser({
        role: Role.LGA_ADMIN,
        lgaId: 'akko',
        additionalScopes: [{ lgaId: 'yamaltu-deba' }],
      });
      expect(service.memberScopeWhere(user)).toEqual({ OR: [{ lgaId: 'akko' }, { lgaId: 'yamaltu-deba' }] });
    });

    it('additional scopes never widen an already-unrestricted actor beyond {}', () => {
      const user = makeUser({ role: Role.SUPER_ADMIN, additionalScopes: [{ lgaId: 'akko' }] });
      expect(service.memberScopeWhere(user)).toEqual({});
    });

    it('falls back to just the additional scope when the primary is unconfigured', () => {
      const user = makeUser({ role: Role.LGA_ADMIN, lgaId: null, additionalScopes: [{ lgaId: 'akko' }] });
      expect(service.memberScopeWhere(user)).toEqual({ lgaId: 'akko' });
    });
  });

  describe('assertCanAccessOrgUnit', () => {
    it('allows a WARD_ADMIN to access their own ward', async () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });
      await expect(
        service.assertCanAccessOrgUnit(user, { wardId: 'ward-1', lgaId: 'lga-1', pollingUnitId: 'pu-1' }),
      ).resolves.not.toThrow();
    });

    it('throws when a WARD_ADMIN targets a different ward', async () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });
      await expect(
        service.assertCanAccessOrgUnit(user, { wardId: 'ward-2', lgaId: 'lga-1', pollingUnitId: 'pu-2' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows unrestricted roles to access any unit', async () => {
      const user = makeUser({ role: Role.STATE_ADMIN });
      await expect(
        service.assertCanAccessOrgUnit(user, { wardId: 'anything', lgaId: 'anything', pollingUnitId: 'anything' }),
      ).resolves.not.toThrow();
    });

    it('allows a SENATORIAL_ADMIN to access an LGA within their district', async () => {
      prismaMock.lGA.findUnique.mockResolvedValue({ senatorialDistrictId: 'district-1' });
      const user = makeUser({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'district-1' });
      await expect(
        service.assertCanAccessOrgUnit(user, { lgaId: 'lga-in-district', wardId: null, pollingUnitId: null }),
      ).resolves.not.toThrow();
      expect(prismaMock.lGA.findUnique).toHaveBeenCalledWith({
        where: { id: 'lga-in-district' },
        select: { senatorialDistrictId: true },
      });
    });

    it('throws when a SENATORIAL_ADMIN targets an LGA outside their district', async () => {
      prismaMock.lGA.findUnique.mockResolvedValue({ senatorialDistrictId: 'other-district' });
      const user = makeUser({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'district-1' });
      await expect(
        service.assertCanAccessOrgUnit(user, { lgaId: 'lga-outside', wardId: null, pollingUnitId: null }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows access via an additional UserScope-granted LGA even when it is not the primary one', async () => {
      const user = makeUser({
        role: Role.LGA_ADMIN,
        lgaId: 'akko',
        additionalScopes: [{ lgaId: 'yamaltu-deba' }],
      });
      await expect(
        service.assertCanAccessOrgUnit(user, { lgaId: 'yamaltu-deba', wardId: null, pollingUnitId: null }),
      ).resolves.not.toThrow();
    });

    it('still denies a unit outside every scope the user holds, primary and additional', async () => {
      const user = makeUser({
        role: Role.LGA_ADMIN,
        lgaId: 'akko',
        additionalScopes: [{ lgaId: 'yamaltu-deba' }],
      });
      await expect(
        service.assertCanAccessOrgUnit(user, { lgaId: 'gombe', wardId: null, pollingUnitId: null }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('eventScopeWhere', () => {
    it('gives unrestricted roles no filter', async () => {
      const user = makeUser({ role: Role.SUPER_ADMIN });
      expect(await service.eventScopeWhere(user)).toEqual({});
    });

    it('lets an LGA_ADMIN see state-wide and their own LGA events', async () => {
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

    it('lets a SENATORIAL_ADMIN see state-wide events and events in any LGA within their district', async () => {
      const user = makeUser({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'district-1' });
      const where = await service.eventScopeWhere(user);
      expect(where).toEqual({
        OR: [
          { targetLgaId: null, targetWardId: null, targetPollingUnitId: null },
          { targetLga: { senatorialDistrictId: 'district-1' } },
        ],
      });
    });

    it('denies a scoped role with no assigned unit', async () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: null });
      expect(await service.eventScopeWhere(user)).toEqual({ id: '__no_access__' });
    });
  });

  describe('resolveScopePath', () => {
    it('returns an empty path for unrestricted roles', async () => {
      const user = makeUser({ role: Role.SUPER_ADMIN });
      expect(await service.resolveScopePath(user)).toEqual({});
    });

    it('resolves the district only for a SENATORIAL_ADMIN', async () => {
      prismaMock.senatorialDistrict.findUnique.mockResolvedValue({ id: 'district-1', name: 'Gombe Central' });
      const user = makeUser({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'district-1' });
      expect(await service.resolveScopePath(user)).toEqual({
        senatorialDistrict: { id: 'district-1', name: 'Gombe Central' },
      });
    });

    it('resolves district + LGA for an LGA_ADMIN', async () => {
      prismaMock.lGA.findUnique.mockResolvedValue({
        id: 'lga-1',
        name: 'Akko',
        senatorialDistrict: { id: 'district-1', name: 'Gombe Central' },
      });
      const user = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });
      expect(await service.resolveScopePath(user)).toEqual({
        senatorialDistrict: { id: 'district-1', name: 'Gombe Central' },
        lga: { id: 'lga-1', name: 'Akko' },
      });
    });

    it('resolves the full chain for a POLLING_UNIT_OFFICER', async () => {
      prismaMock.pollingUnit.findUnique.mockResolvedValue({
        id: 'pu-1',
        name: 'Kumo Central Primary School',
        ward: {
          id: 'ward-1',
          name: 'Kumo Central',
          lga: { id: 'lga-1', name: 'Akko', senatorialDistrict: { id: 'district-1', name: 'Gombe Central' } },
        },
      });
      const user = makeUser({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1' });
      expect(await service.resolveScopePath(user)).toEqual({
        senatorialDistrict: { id: 'district-1', name: 'Gombe Central' },
        lga: { id: 'lga-1', name: 'Akko' },
        ward: { id: 'ward-1', name: 'Kumo Central' },
        pollingUnit: { id: 'pu-1', name: 'Kumo Central Primary School' },
      });
    });

    it('returns an empty path for an unconfigured scoped role', async () => {
      const user = makeUser({ role: Role.WARD_ADMIN, wardId: null });
      expect(await service.resolveScopePath(user)).toEqual({});
    });
  });
});
