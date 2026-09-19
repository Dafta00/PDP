import { ConflictException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { MembersService } from './members.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

function makeUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'actor-1',
    email: 'actor@example.com',
    role: Role.WARD_ADMIN,
    senatorialDistrictId: null,
    lgaId: null,
    wardId: null,
    pollingUnitId: null,
    ...overrides,
  };
}

const POLLING_UNIT = {
  id: 'pu-1',
  wardId: 'ward-1',
  ward: { lgaId: 'lga-1', lga: { senatorialDistrict: { name: 'Gombe Central' } } },
};

function makeService(memberRows: any[] = []) {
  const prisma: any = {
    pollingUnit: { findUniqueOrThrow: jest.fn().mockResolvedValue(POLLING_UNIT) },
    member: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.ninHash) {
          return memberRows.find((m) => m.ninHash === where.ninHash && m.id !== where.NOT?.id) ?? null;
        }
        if (where.pvcNumber) {
          return memberRows.find((m) => m.pvcNumber === where.pvcNumber && m.id !== where.NOT?.id) ?? null;
        }
        return memberRows.find((m) => m.id === where.id) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => ({ id: 'member-new', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({
        ...memberRows.find((m) => m.id === where.id),
        ...data,
      })),
    },
  };
  const auditService = { record: jest.fn() };
  const orgScope = { assertCanAccessOrgUnit: jest.fn().mockResolvedValue(undefined) };
  const authorization = { canViewMemberNIN: jest.fn().mockReturnValue(false) };
  const membershipIdService = { next: jest.fn().mockResolvedValue('PDP-GC-2026-000001') };
  const qrService = { issueForMember: jest.fn(), getQrImageForMember: jest.fn() };

  const service = new MembersService(
    prisma,
    auditService as any,
    orgScope as any,
    authorization as any,
    membershipIdService as any,
    qrService as any,
  );
  return { service, prisma, auditService, orgScope, authorization };
}

const BASE_DTO = {
  firstName: 'Amina',
  surname: 'Bello',
  gender: 'FEMALE' as const,
  dateOfBirth: '1990-01-01',
  phone: '08012345678',
  pollingUnitId: 'pu-1',
};

describe('MembersService', () => {
  beforeEach(() => {
    process.env.NIN_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.NIN_HASH_SECRET = 'b'.repeat(64);
  });

  describe('create — NIN handling', () => {
    it('rejects a duplicate NIN with the exact required message', async () => {
      const { service } = makeService([{ id: 'existing', ninHash: expect.any(String) }]);
      // Force the fake findFirst to report a collision regardless of hash value.
      (service as any).prisma.member.findFirst = jest.fn().mockResolvedValue({ id: 'existing' });

      const actor = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });
      await expect(service.create({ ...BASE_DTO, nin: '12345678901' } as any, actor)).rejects.toMatchObject({
        message: 'Registration failed: This NIN is already associated with another member.',
      });
      expect(service['prisma'].member.create).not.toHaveBeenCalled();
    });

    it('creates successfully when the NIN is unique, storing only encrypted/hashed forms', async () => {
      const { service, prisma } = makeService([]);
      const actor = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });

      await service.create({ ...BASE_DTO, nin: '12345678901' } as any, actor);

      const createCall = prisma.member.create.mock.calls[0][0];
      expect(createCall.data.ninHash).toBeDefined();
      expect(createCall.data.ninEncrypted).toBeDefined();
      expect(createCall.data.ninEncrypted).not.toContain('12345678901');
      expect(createCall.data).not.toHaveProperty('nin');
    });

    it('never returns the decrypted NIN to a non-SUPER_ADMIN actor', async () => {
      const { service, authorization } = makeService([]);
      authorization.canViewMemberNIN.mockReturnValue(false);
      const actor = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });

      const result = await service.create({ ...BASE_DTO, nin: '12345678901' } as any, actor);

      expect(result).not.toHaveProperty('nin');
      expect(result).not.toHaveProperty('ninEncrypted');
      expect(result).not.toHaveProperty('ninHash');
      expect(result.hasNin).toBe(true);
    });

    it('returns the decrypted NIN only when canViewMemberNIN allows it, and audits the reveal', async () => {
      const { service, authorization, auditService } = makeService([]);
      authorization.canViewMemberNIN.mockReturnValue(true);
      const actor = makeUser({ role: Role.SUPER_ADMIN });

      const result = await service.create({ ...BASE_DTO, nin: '12345678901' } as any, actor);

      expect(result.nin).toBe('12345678901');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEMBER_NIN_VIEWED', entityType: 'Member' }),
      );
    });

    it('handles a race-condition duplicate at the database level (P2002 on ninHash)', async () => {
      const { service, prisma, auditService } = makeService([]);
      prisma.member.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['ninHash'] },
        }),
      );
      const actor = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });

      await expect(service.create({ ...BASE_DTO, nin: '12345678901' } as any, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEMBER_DUPLICATE_NIN_ATTEMPT' }),
      );
    });
  });

  describe('create — PVC handling', () => {
    it('rejects a duplicate PVC with the exact required message', async () => {
      const { service } = makeService([]);
      (service as any).prisma.member.findFirst = jest.fn().mockResolvedValue({ id: 'existing' });
      const actor = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });

      await expect(
        service.create({ ...BASE_DTO, pvcNumber: '90F5ABCDE12345' } as any, actor),
      ).rejects.toMatchObject({
        message: 'Registration failed: This PVC identifier is already associated with another member.',
      });
    });

    it('normalizes PVC (trims/uppercases) before storing and checking', async () => {
      const { service, prisma } = makeService([]);
      const actor = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });

      await service.create({ ...BASE_DTO, pvcNumber: ' 90f5abcde12345 ' } as any, actor);

      expect(prisma.member.create.mock.calls[0][0].data.pvcNumber).toBe('90F5ABCDE12345');
    });
  });

  describe('update — NIN/PVC re-check', () => {
    it('rejects updating a member with a NIN already used by a DIFFERENT member', async () => {
      const existing = {
        id: 'member-1',
        lgaId: 'lga-1',
        wardId: 'ward-1',
        pollingUnitId: 'pu-1',
        status: 'PENDING',
        photoUrl: null,
      };
      const { service } = makeService([existing]);
      (service as any).prisma.member.findFirst = jest
        .fn()
        .mockResolvedValueOnce(existing) // load-existing-for-update lookup
        .mockResolvedValueOnce({ id: 'someone-else' }); // NIN collision lookup

      const actor = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });
      await expect(service.update('member-1', { nin: '12345678901' } as any, actor)).rejects.toMatchObject({
        message: 'Registration failed: This NIN is already associated with another member.',
      });
    });

    it('does not re-check NIN/PVC when the update omits those fields', async () => {
      const existing = {
        id: 'member-1',
        lgaId: 'lga-1',
        wardId: 'ward-1',
        pollingUnitId: 'pu-1',
        status: 'PENDING',
        photoUrl: null,
      };
      const { service, prisma } = makeService([existing]);
      prisma.member.findFirst.mockResolvedValue(existing);

      const actor = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-1' });
      await service.update('member-1', { firstName: 'Updated' } as any, actor);

      expect(prisma.member.update.mock.calls[0][0].data.ninHash).toBeUndefined();
      expect(prisma.member.update.mock.calls[0][0].data.pvcNumber).toBeUndefined();
    });
  });

  describe('list select', () => {
    it('never selects ninEncrypted/ninHash/pvcNumber in the list projection', async () => {
      const { service } = makeService([]);
      (service as any).prisma.member.findMany = jest.fn().mockResolvedValue([]);
      (service as any).prisma.member.count = jest.fn().mockResolvedValue(0);
      (service as any).orgScope.memberScopeWhere = jest.fn().mockReturnValue({});

      const actor = makeUser({ role: Role.SUPER_ADMIN });
      await service.findAll({} as any, actor);

      const select = (service as any).prisma.member.findMany.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('ninEncrypted');
      expect(select).not.toHaveProperty('ninHash');
      expect(select).not.toHaveProperty('pvcNumber');
    });
  });
});
