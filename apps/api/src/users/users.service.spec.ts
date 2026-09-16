import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

function makeActor(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'actor-1',
    email: 'actor@example.com',
    role: Role.WARD_ADMIN,
    senatorialDistrictId: null,
    lgaId: null,
    wardId: null,
    pollingUnitId: null,
    canCreateUsers: false,
    ...overrides,
  };
}

function makeDeps() {
  const prisma = {
    user: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    lGA: { findUnique: jest.fn() },
    ward: { findUnique: jest.fn() },
    pollingUnit: { findUnique: jest.fn() },
    rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
    userPermission: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), deleteMany: jest.fn() },
    userScope: { create: jest.fn(), findUniqueOrThrow: jest.fn(), delete: jest.fn() },
  };
  const auditService = { record: jest.fn() };
  const orgScope = new OrgScopeService(prisma as any);
  const authorization = new AuthorizationService(prisma as any, auditService as any, orgScope);
  const service = new UsersService(prisma as any, auditService as any, authorization);
  return { service, prisma, auditService, authorization };
}

const CREATE_BASE = {
  email: 'new@example.com',
  password: 'password123',
  fullName: 'New User',
};

describe('UsersService — hierarchical authority', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('role authority (no geography involved)', () => {
    it('allows SUPER_ADMIN to create a STATE_ADMIN', async () => {
      const { service, prisma } = makeDeps();
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.STATE_ADMIN });
      const actor = makeActor({ role: Role.SUPER_ADMIN });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.STATE_ADMIN } as any, actor),
      ).resolves.toBeDefined();
    });

    it('allows SUPER_ADMIN to create another SUPER_ADMIN (the one unrestricted authority)', async () => {
      const { service, prisma } = makeDeps();
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.SUPER_ADMIN });
      const actor = makeActor({ role: Role.SUPER_ADMIN });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.SUPER_ADMIN } as any, actor),
      ).resolves.toBeDefined();
    });

    it('denies STATE_ADMIN creating a SUPER_ADMIN', async () => {
      const { service, auditService } = makeDeps();
      const actor = makeActor({ role: Role.STATE_ADMIN });

      await expect(service.create({ ...CREATE_BASE, role: Role.SUPER_ADMIN } as any, actor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_MANAGEMENT_DENIED' }),
      );
    });

    it('denies STATE_ADMIN creating another STATE_ADMIN', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.STATE_ADMIN });

      await expect(service.create({ ...CREATE_BASE, role: Role.STATE_ADMIN } as any, actor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('SUPER_ADMIN → create SENATORIAL_ADMIN → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.SENATORIAL_ADMIN });
      const actor = makeActor({ role: Role.SUPER_ADMIN });
      await expect(
        service.create(
          { ...CREATE_BASE, role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'd1' } as any,
          actor,
        ),
      ).resolves.toBeDefined();
    });

    it('SUPER_ADMIN → create LGA_ADMIN → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.LGA_ADMIN });
      const actor = makeActor({ role: Role.SUPER_ADMIN });
      await expect(
        service.create({ ...CREATE_BASE, role: Role.LGA_ADMIN, lgaId: 'akko' } as any, actor),
      ).resolves.toBeDefined();
    });

    it('SUPER_ADMIN → create WARD_ADMIN → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.WARD_ADMIN });
      const actor = makeActor({ role: Role.SUPER_ADMIN });
      await expect(
        service.create({ ...CREATE_BASE, role: Role.WARD_ADMIN, wardId: 'ward-x' } as any, actor),
      ).resolves.toBeDefined();
    });

    it('SUPER_ADMIN → create POLLING_UNIT_OFFICER → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.POLLING_UNIT_OFFICER });
      const actor = makeActor({ role: Role.SUPER_ADMIN });
      await expect(
        service.create(
          { ...CREATE_BASE, role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1' } as any,
          actor,
        ),
      ).resolves.toBeDefined();
    });

    it('LGA_ADMIN → create LGA_ADMIN → DENY', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.LGA_ADMIN, lgaId: 'akko' });
      await expect(
        service.create({ ...CREATE_BASE, role: Role.LGA_ADMIN, lgaId: 'akko' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('WARD_ADMIN → create LGA_ADMIN → DENY', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.WARD_ADMIN, wardId: 'ward-x' });
      await expect(
        service.create({ ...CREATE_BASE, role: Role.LGA_ADMIN, lgaId: 'akko' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows STATE_ADMIN to create a SENATORIAL_ADMIN', async () => {
      const { service, prisma } = makeDeps();
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.SENATORIAL_ADMIN });
      const actor = makeActor({ role: Role.STATE_ADMIN });

      await expect(
        service.create(
          { ...CREATE_BASE, role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'district-1' } as any,
          actor,
        ),
      ).resolves.toBeDefined();
    });

    it('denies SENATORIAL_ADMIN creating another SENATORIAL_ADMIN', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'district-1' });

      await expect(
        service.create(
          { ...CREATE_BASE, role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'district-1' } as any,
          actor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies DATA_ENTRY_OFFICER creating anyone at all', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.DATA_ENTRY_OFFICER });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.DATA_ENTRY_OFFICER } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('spec worked examples — role + scope', () => {
    it('Example 1: SENATORIAL_ADMIN(Gombe Central) creating LGA_ADMIN(Akko) → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      prisma.lGA.findUnique.mockResolvedValue({ senatorialDistrictId: 'gombe-central' });
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.LGA_ADMIN });
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'gombe-central' });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.LGA_ADMIN, lgaId: 'akko' } as any, actor),
      ).resolves.toBeDefined();
    });

    it('Example 2: SENATORIAL_ADMIN(Gombe Central) creating LGA_ADMIN(Gombe LGA, in Gombe North) → DENY', async () => {
      const { service, prisma, auditService } = makeDeps();
      prisma.lGA.findUnique.mockResolvedValue({ senatorialDistrictId: 'gombe-north' });
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'gombe-central' });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.LGA_ADMIN, lgaId: 'gombe-lga' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_MANAGEMENT_DENIED',
          metadata: expect.objectContaining({ targetRole: Role.LGA_ADMIN }),
        }),
      );
    });

    it('Example 3: SENATORIAL_ADMIN creating a SUPER_ADMIN → DENY', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'gombe-central' });

      await expect(service.create({ ...CREATE_BASE, role: Role.SUPER_ADMIN } as any, actor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Example 4: LGA_ADMIN(Akko) creating WARD_ADMIN(ward in Akko) → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      // canonicalScope keeps only wardId for a WARD_ADMIN target, so containment
      // resolves the ward's real LGA from the DB rather than trusting the dto's lgaId.
      prisma.ward.findUnique.mockResolvedValue({ lgaId: 'akko' });
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.WARD_ADMIN });
      const actor = makeActor({ role: Role.LGA_ADMIN, lgaId: 'akko' });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.WARD_ADMIN, lgaId: 'akko', wardId: 'ward-x' } as any, actor),
      ).resolves.toBeDefined();
    });

    it('Example 5: LGA_ADMIN(Akko) creating WARD_ADMIN(ward in Gombe LGA) → DENY', async () => {
      const { service, prisma } = makeDeps();
      // canonicalScope keeps only wardId for WARD_ADMIN; containment resolves the ward's real LGA.
      prisma.ward.findUnique.mockResolvedValue({ lgaId: 'gombe-lga' });
      const actor = makeActor({ role: Role.LGA_ADMIN, lgaId: 'akko' });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.WARD_ADMIN, wardId: 'ward-in-gombe' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Example 6: WARD_ADMIN(Ward X) creating POLLING_UNIT_OFFICER(PU in Ward X) → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      prisma.pollingUnit.findUnique.mockResolvedValue({ wardId: 'ward-x' });
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.POLLING_UNIT_OFFICER });
      const actor = makeActor({ role: Role.WARD_ADMIN, wardId: 'ward-x' });

      await expect(
        service.create(
          { ...CREATE_BASE, role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-in-x' } as any,
          actor,
        ),
      ).resolves.toBeDefined();
    });

    it('Example 7: WARD_ADMIN(Ward X) creating POLLING_UNIT_OFFICER(PU in Ward Y) → DENY', async () => {
      const { service, prisma } = makeDeps();
      prisma.pollingUnit.findUnique.mockResolvedValue({ wardId: 'ward-y' });
      const actor = makeActor({ role: Role.WARD_ADMIN, wardId: 'ward-x' });

      await expect(
        service.create(
          { ...CREATE_BASE, role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-in-y' } as any,
          actor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('canonical scope hardening', () => {
    it('ignores a broader scope id the client also sent — only the role-relevant field is trusted', async () => {
      const { service, prisma } = makeDeps();
      // A WARD_ADMIN's own ward is "ward-x", but they also send lgaId "some-other-lga"
      // hoping it gets used instead. It must be discarded entirely.
      prisma.pollingUnit.findUnique.mockResolvedValue({ wardId: 'ward-x' });
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.POLLING_UNIT_OFFICER });
      const actor = makeActor({ role: Role.WARD_ADMIN, wardId: 'ward-x' });

      await service.create(
        {
          ...CREATE_BASE,
          role: Role.POLLING_UNIT_OFFICER,
          pollingUnitId: 'pu-in-x',
          lgaId: 'some-other-lga',
          senatorialDistrictId: 'some-district',
        } as any,
        actor,
      );

      const writeData = prisma.user.create.mock.calls[0][0].data;
      expect(writeData.lgaId).toBeNull();
      expect(writeData.senatorialDistrictId).toBeNull();
      expect(writeData.pollingUnitId).toBe('pu-in-x');
    });

    it('rejects creating a fixed-scope role with no scope id at all', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.LGA_ADMIN, lgaId: 'akko' });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.WARD_ADMIN } as any, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POLLING_UNIT_OFFICER creation gate', () => {
    it('denies user creation by default (canCreateUsers false)', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1', canCreateUsers: false });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.DATA_ENTRY_OFFICER, pollingUnitId: 'pu-1' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows creating a DATA_ENTRY_OFFICER in the same polling unit once granted', async () => {
      const { service, prisma } = makeDeps();
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.DATA_ENTRY_OFFICER });
      const actor = makeActor({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1', canCreateUsers: true });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.DATA_ENTRY_OFFICER, pollingUnitId: 'pu-1' } as any, actor),
      ).resolves.toBeDefined();
    });

    it('still denies a non-DATA_ENTRY_OFFICER target even when granted', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1', canCreateUsers: true });

      await expect(
        service.create({ ...CREATE_BASE, role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-2' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a lower admin creating a POLLING_UNIT_OFFICER can never grant the permission themselves', async () => {
      const { service, prisma } = makeDeps();
      prisma.pollingUnit.findUnique.mockResolvedValue({ wardId: 'ward-x' });
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.POLLING_UNIT_OFFICER });
      const actor = makeActor({ role: Role.WARD_ADMIN, wardId: 'ward-x' });

      await service.create(
        {
          ...CREATE_BASE,
          role: Role.POLLING_UNIT_OFFICER,
          pollingUnitId: 'pu-in-x',
          canCreateUsers: true,
        } as any,
        actor,
      );

      expect(prisma.user.create.mock.calls[0][0].data.canCreateUsers).toBe(false);
    });

    it('only a SUPER_ADMIN can grant it, and it sticks', async () => {
      const { service, prisma } = makeDeps();
      prisma.user.create.mockResolvedValue({ id: 'u1', role: Role.POLLING_UNIT_OFFICER });
      const actor = makeActor({ role: Role.SUPER_ADMIN });

      await service.create(
        { ...CREATE_BASE, role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1', canCreateUsers: true } as any,
        actor,
      );

      expect(prisma.user.create.mock.calls[0][0].data.canCreateUsers).toBe(true);
    });
  });

  describe('self-escalation protection', () => {
    it('denies a self role change, even to the same role', async () => {
      const { service, prisma, auditService } = makeDeps();
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'd1' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: actor.id,
        role: Role.SENATORIAL_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: 'd1',
        lgaId: null,
        wardId: null,
        pollingUnitId: null,
      });

      await expect(service.update(actor.id, { role: Role.SENATORIAL_ADMIN } as any, actor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_MANAGEMENT_DENIED' }),
      );
    });

    it('denies a self scope expansion', async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.LGA_ADMIN, lgaId: 'akko' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: actor.id,
        role: Role.LGA_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: null,
        lgaId: 'akko',
        wardId: null,
        pollingUnitId: null,
      });

      await expect(
        service.update(actor.id, { senatorialDistrictId: 'gombe-central' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies a self status change (cannot reactivate/deactivate self)', async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.SUPER_ADMIN });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: actor.id,
        role: Role.SUPER_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: null,
        lgaId: null,
        wardId: null,
        pollingUnitId: null,
      });

      await expect(service.update(actor.id, { status: 'DISABLED' } as any, actor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows a self fullName-only edit, bypassing hierarchy checks entirely', async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.SUPER_ADMIN });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: actor.id,
        role: Role.SUPER_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: null,
        lgaId: null,
        wardId: null,
        pollingUnitId: null,
      });
      prisma.user.update.mockResolvedValue({ id: actor.id, fullName: 'New Name' });

      await expect(service.update(actor.id, { fullName: 'New Name' } as any, actor)).resolves.toBeDefined();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { fullName: 'New Name' } }),
      );
    });
  });

  describe('malicious payloads / direct API manipulation (section 15)', () => {
    it('rejects a scoped actor trying to self-promote to SUPER_ADMIN via PATCH', async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'gombe-central' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: actor.id,
        role: Role.SENATORIAL_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: 'gombe-central',
        lgaId: null,
        wardId: null,
        pollingUnitId: null,
      });

      await expect(
        service.update(actor.id, { role: 'SUPER_ADMIN' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a scoped actor trying to self-promote to STATE_ADMIN via PATCH', async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'gombe-central' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: actor.id,
        role: Role.SENATORIAL_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: 'gombe-central',
        lgaId: null,
        wardId: null,
        pollingUnitId: null,
      });

      await expect(
        service.update(actor.id, { role: 'STATE_ADMIN' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a Central admin trying to smuggle a North-district scope onto a subordinate via extra body fields', async () => {
      const { service, prisma } = makeDeps();
      prisma.lGA.findUnique.mockResolvedValue({ senatorialDistrictId: 'gombe-north' });
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'gombe-central' });

      // Malicious body: role is a legitimately-manageable one, but the scope
      // fields try to reach into another district entirely.
      await expect(
        service.create(
          {
            ...CREATE_BASE,
            role: Role.LGA_ADMIN,
            lgaId: 'gombe-lga', // belongs to Gombe North per the mock above
            senatorialDistrictId: 'GOMBE_STATE', // nonsense value trying to widen scope
          } as any,
          actor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects an update body containing an unrelated scope override ('senatorialDistrictId: NORTH') for an out-of-scope target", async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'gombe-central' });
      // Target is currently an LGA_ADMIN inside the actor's own district...
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'target-1',
        role: Role.LGA_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: null,
        lgaId: 'akko',
        wardId: null,
        pollingUnitId: null,
      });
      // First lookup is for the CURRENT-role check (existing lgaId 'akko' → their own district, passes);
      // second is for the proposed NEXT scope ('gombe-lga' → a different district, must fail).
      prisma.lGA.findUnique.mockResolvedValueOnce({ senatorialDistrictId: 'gombe-central' });
      prisma.lGA.findUnique.mockResolvedValueOnce({ senatorialDistrictId: 'gombe-north' });

      await expect(
        service.update('target-1', { lgaId: 'gombe-lga' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update() on another user', () => {
    it('SUPER_ADMIN may modify another SUPER_ADMIN account (the one unrestricted authority)', async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.SUPER_ADMIN });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'other-super',
        role: Role.SUPER_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: null,
        lgaId: null,
        wardId: null,
        pollingUnitId: null,
      });
      prisma.user.update.mockResolvedValue({ id: 'other-super', status: 'DISABLED' });

      await expect(
        service.update('other-super', { status: 'DISABLED' } as any, actor),
      ).resolves.toBeDefined();
    });

    it('denies editing a peer of equal rank (e.g. one WARD_ADMIN editing another)', async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.WARD_ADMIN, wardId: 'ward-x' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'peer',
        role: Role.WARD_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: null,
        lgaId: null,
        wardId: 'ward-x',
        pollingUnitId: null,
      });

      await expect(service.update('peer', { fullName: 'Renamed' } as any, actor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('denies promoting a subordinate to a role at or above the actor', async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.LGA_ADMIN, lgaId: 'akko' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'subordinate',
        role: Role.WARD_ADMIN,
        status: 'ACTIVE',
        senatorialDistrictId: null,
        lgaId: null,
        wardId: 'ward-in-akko',
        pollingUnitId: null,
      });
      prisma.ward.findUnique.mockResolvedValue({ lgaId: 'akko' });

      await expect(
        service.update('subordinate', { role: Role.LGA_ADMIN, lgaId: 'akko' } as any, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('revokes canCreateUsers when a granted PU officer is moved to a different role', async () => {
      const { service, prisma } = makeDeps();
      const actor = makeActor({ role: Role.SUPER_ADMIN });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'pu-officer',
        role: Role.POLLING_UNIT_OFFICER,
        status: 'ACTIVE',
        senatorialDistrictId: null,
        lgaId: null,
        wardId: null,
        pollingUnitId: 'pu-1',
      });
      prisma.user.update.mockResolvedValue({ id: 'pu-officer', role: Role.DATA_ENTRY_OFFICER });

      await service.update(
        'pu-officer',
        { role: Role.DATA_ENTRY_OFFICER, pollingUnitId: 'pu-1' } as any,
        actor,
      );

      expect(prisma.user.update.mock.calls[0][0].data.canCreateUsers).toBe(false);
    });
  });
});
