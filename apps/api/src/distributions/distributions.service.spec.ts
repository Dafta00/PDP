import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { DistributionsService } from './distributions.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

function makeUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'officer-1',
    email: 'officer@example.com',
    role: Role.POLLING_UNIT_OFFICER,
    senatorialDistrictId: null,
    lgaId: null,
    wardId: null,
    pollingUnitId: 'pu-1',
    ...overrides,
  };
}

const MEMBER = {
  id: 'member-1',
  membershipId: 'PDP-GC-2026-000001',
  firstName: 'Aisha',
  middleName: null,
  surname: 'Mohammed',
  photoUrl: null,
  status: 'ACTIVE',
};

function duplicateKeyError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

/** In-memory fake exercising the real conditional-update / unique-constraint semantics. */
function makeFakeDb() {
  const allocations = new Map<string, any>();
  const receipts = new Map<string, any>();
  let receiptSeq = 0;

  const findReceiptKey = (distributionId: string, memberId: string) =>
    [...receipts.values()].find((r) => r.distributionId === distributionId && r.memberId === memberId);

  const prisma: any = {
    distribution: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'dist-1',
        status: 'ACTIVE',
        resourceId: 'res-1',
      }),
    },
    resourceAllocation: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          [...allocations.values()].find((a) => {
            if (where.distributionId && a.distributionId !== where.distributionId) return false;
            if (where.targetPollingUnitId && a.targetPollingUnitId !== where.targetPollingUnitId) return false;
            return true;
          }) ?? null
        );
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const a = allocations.get(where.id);
        if (!a || a.remainingQuantity < where.remainingQuantity.gte) return { count: 0 };
        a.remainingQuantity -= data.remainingQuantity.decrement;
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const a = allocations.get(where.id);
        a.remainingQuantity += data.remainingQuantity.increment;
        return a;
      }),
    },
    distributionReceipt: {
      create: jest.fn(async ({ data }: any) => {
        if (findReceiptKey(data.distributionId, data.memberId)) throw duplicateKeyError();
        const id = `receipt-${++receiptSeq}`;
        const record = { id, ...data };
        receipts.set(id, record);
        return record;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const r = findReceiptKey(where.distributionId, where.memberId);
        if (!r || r.status !== where.status) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const r = receipts.get(where.id);
        Object.assign(r, data);
        return r;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const r = findReceiptKey(where.distributionId_memberId.distributionId, where.distributionId_memberId.memberId);
        if (!r) throw new Error('not found');
        return r;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return receipts.get(where.id) ?? null;
        if (where.distributionId_memberId) {
          return (
            findReceiptKey(
              where.distributionId_memberId.distributionId,
              where.distributionId_memberId.memberId,
            ) ?? null
          );
        }
        return null;
      }),
    },
    // Simulates real Postgres transaction rollback: snapshot mutable state
    // before running the callback, restore it if the callback throws. Without
    // this, a fake that just calls `fn(prisma)` would let partial writes
    // (e.g. an allocation decrement) survive a later failure in the same
    // transaction — masking exactly the kind of bug this atomicity exists to
    // prevent.
    $transaction: jest.fn(async (fn: any) => {
      const allocationsSnapshot = new Map([...allocations].map(([k, v]) => [k, { ...v }]));
      const receiptsSnapshot = new Map([...receipts].map(([k, v]) => [k, { ...v }]));
      try {
        return await fn(prisma);
      } catch (error) {
        allocations.clear();
        allocationsSnapshot.forEach((v, k) => allocations.set(k, v));
        receipts.clear();
        receiptsSnapshot.forEach((v, k) => receipts.set(k, v));
        throw error;
      }
    }),
  };

  return { prisma, allocations, receipts };
}

function makeService(prisma: any) {
  const auditService = { record: jest.fn() };
  const orgScope = new OrgScopeService(prisma as any);
  const resourcesService = {
    findAllocationOne: jest.fn(),
    createAllocation: jest.fn(),
    listAllocations: jest.fn(),
  };
  const verificationService = { resolveMember: jest.fn().mockResolvedValue(MEMBER) };
  const service = new DistributionsService(
    prisma,
    auditService as any,
    orgScope,
    resourcesService as any,
    verificationService as any,
  );
  return { service, auditService, verificationService };
}

describe('DistributionsService.confirmReceipt', () => {
  it('refuses to confirm a receipt for a non-ACTIVE distribution', async () => {
    const { prisma } = makeFakeDb();
    prisma.distribution.findUnique.mockResolvedValue({ id: 'dist-1', status: 'DRAFT', resourceId: 'res-1' });
    const { service } = makeService(prisma);
    const actor = makeUser({});

    await expect(
      service.confirmReceipt('dist-1', { membershipId: MEMBER.membershipId }, actor),
    ).rejects.toThrow(BadRequestException);
  });

  it('confirms a receipt against the officer\'s own polling-unit allocation, decrementing it', async () => {
    const { prisma, allocations } = makeFakeDb();
    allocations.set('alloc-1', {
      id: 'alloc-1',
      distributionId: 'dist-1',
      targetPollingUnitId: 'pu-1',
      remainingQuantity: 10,
    });
    const { service, auditService } = makeService(prisma);
    const actor = makeUser({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1' });

    const result = await service.confirmReceipt('dist-1', { membershipId: MEMBER.membershipId }, actor);

    expect(result.member.membershipId).toBe(MEMBER.membershipId);
    expect(allocations.get('alloc-1').remainingQuantity).toBe(9);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RECEIPT_CONFIRMED' }),
    );
  });

  it('rejects a second confirmed receipt for the same member in the same distribution', async () => {
    const { prisma, allocations } = makeFakeDb();
    allocations.set('alloc-1', {
      id: 'alloc-1',
      distributionId: 'dist-1',
      targetPollingUnitId: 'pu-1',
      remainingQuantity: 10,
    });
    const { service, auditService } = makeService(prisma);
    const actor = makeUser({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1' });

    await service.confirmReceipt('dist-1', { membershipId: MEMBER.membershipId }, actor);

    await expect(
      service.confirmReceipt('dist-1', { membershipId: MEMBER.membershipId }, actor),
    ).rejects.toThrow(ConflictException);

    expect(allocations.get('alloc-1').remainingQuantity).toBe(9); // second attempt did not consume stock
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RECEIPT_REJECTED' }),
    );
  });

  it('lets a previously reversed receipt be reactivated instead of blocked as a duplicate', async () => {
    const { prisma, allocations, receipts } = makeFakeDb();
    allocations.set('alloc-1', {
      id: 'alloc-1',
      distributionId: 'dist-1',
      targetPollingUnitId: 'pu-1',
      remainingQuantity: 10,
    });
    const { service } = makeService(prisma);
    const actor = makeUser({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1' });

    const first = await service.confirmReceipt('dist-1', { membershipId: MEMBER.membershipId }, actor);
    receipts.get(first.receipt.id).status = 'REVERSED';

    const second = await service.confirmReceipt('dist-1', { membershipId: MEMBER.membershipId }, actor);
    expect(second.receipt.id).toBe(first.receipt.id);
    expect(receipts.get(first.receipt.id).status).toBe('CONFIRMED');
  });

  it('throws when no allocation exists for the officer\'s unit', async () => {
    const { prisma } = makeFakeDb();
    const { service } = makeService(prisma);
    const actor = makeUser({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-unallocated' });

    await expect(
      service.confirmReceipt('dist-1', { membershipId: MEMBER.membershipId }, actor),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when no member resolves', async () => {
    const { prisma, allocations } = makeFakeDb();
    allocations.set('alloc-1', {
      id: 'alloc-1',
      distributionId: 'dist-1',
      targetPollingUnitId: 'pu-1',
      remainingQuantity: 10,
    });
    const { service, verificationService } = makeService(prisma);
    verificationService.resolveMember.mockResolvedValue(null);
    const actor = makeUser({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1' });

    await expect(
      service.confirmReceipt('dist-1', { membershipId: 'nope' }, actor),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('DistributionsService.reverseReceipt', () => {
  it('restores the allocation quantity and flips status to REVERSED', async () => {
    const { prisma, allocations } = makeFakeDb();
    allocations.set('alloc-1', {
      id: 'alloc-1',
      distributionId: 'dist-1',
      targetLgaId: 'lga-1',
      targetWardId: null,
      targetPollingUnitId: null,
      remainingQuantity: 5,
    });
    const storedReceipt = {
      id: 'receipt-1',
      distributionId: 'dist-1',
      allocationId: 'alloc-1',
      memberId: 'member-1',
      quantity: 2,
      status: 'CONFIRMED',
      allocation: allocations.get('alloc-1'),
    };
    prisma.distributionReceipt.findUnique = jest.fn().mockResolvedValue(storedReceipt);
    prisma.distributionReceipt.update = jest.fn(async ({ data }: any) => Object.assign(storedReceipt, data));
    const { service, auditService } = makeService(prisma);
    const actor = makeUser({ role: Role.LGA_ADMIN, pollingUnitId: null, lgaId: 'lga-1' });

    await service.reverseReceipt('dist-1', 'receipt-1', actor);

    expect(allocations.get('alloc-1').remainingQuantity).toBe(7);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RECEIPT_REVERSED' }),
    );
  });

  it('refuses a POLLING_UNIT_OFFICER attempting to reverse a receipt', async () => {
    const { prisma } = makeFakeDb();
    prisma.distributionReceipt.findUnique = jest.fn().mockResolvedValue({
      id: 'receipt-1',
      distributionId: 'dist-1',
      status: 'CONFIRMED',
      allocation: { targetLgaId: 'lga-1', targetWardId: null, targetPollingUnitId: 'pu-1' },
    });
    const { service } = makeService(prisma);
    const actor = makeUser({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1' });

    await expect(service.reverseReceipt('dist-1', 'receipt-1', actor)).rejects.toThrow(BadRequestException);
  });

  it('refuses reversing an already-reversed receipt', async () => {
    const { prisma } = makeFakeDb();
    prisma.distributionReceipt.findUnique = jest.fn().mockResolvedValue({
      id: 'receipt-1',
      distributionId: 'dist-1',
      status: 'REVERSED',
      allocation: { targetLgaId: 'lga-1', targetWardId: null, targetPollingUnitId: null },
    });
    const { service } = makeService(prisma);
    const actor = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });

    await expect(service.reverseReceipt('dist-1', 'receipt-1', actor)).rejects.toThrow(BadRequestException);
  });
});
