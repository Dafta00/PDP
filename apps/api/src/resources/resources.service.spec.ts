import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, ResourceTransactionType } from '@prisma/client';
import { ResourcesService } from './resources.service';
import { AllocationTargetLevel } from './dto/create-allocation.dto';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

function makeUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'actor-1',
    email: 'actor@example.com',
    role: Role.LGA_ADMIN,
    senatorialDistrictId: null,
    lgaId: null,
    wardId: null,
    pollingUnitId: null,
    ...overrides,
  };
}

/** In-memory fake standing in for a Postgres row, so the atomic conditional
 * update semantics (`updateMany` with a `gte` guard) are exercised for real
 * rather than assumed. */
function makeFakeDb() {
  const resources = new Map<string, { id: string; remainingQuantity: number; unit: string | null }>();
  const allocations = new Map<string, { id: string; remainingQuantity: number; targetLgaId: string; targetWardId: string | null; targetPollingUnitId: string | null }>();
  let allocationSeq = 0;

  const prisma: any = {
    lGA: { findUnique: jest.fn().mockResolvedValue({ id: 'lga-1' }) },
    ward: { findUnique: jest.fn() },
    pollingUnit: { findUnique: jest.fn() },
    resource: {
      findUnique: jest.fn(async ({ where: { id } }: any) => resources.get(id) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const r = resources.get(where.id);
        if (!r || r.remainingQuantity < where.remainingQuantity.gte) return { count: 0 };
        r.remainingQuantity -= data.remainingQuantity.decrement;
        return { count: 1 };
      }),
    },
    resourceAllocation: {
      create: jest.fn(async ({ data }: any) => {
        const id = `alloc-${++allocationSeq}`;
        const record = { id, ...data };
        allocations.set(id, record);
        return record;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const a = allocations.get(where.id);
        if (!a || a.remainingQuantity < where.remainingQuantity.gte) return { count: 0 };
        a.remainingQuantity -= data.remainingQuantity.decrement;
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const a = allocations.get(where.id);
        if (!a) throw new Error('allocation not found');
        a.remainingQuantity += data.remainingQuantity.increment;
        return a;
      }),
      findUnique: jest.fn(async ({ where: { id } }: any) => allocations.get(id) ?? null),
    },
    resourceTransaction: {
      create: jest.fn(async ({ data }: any) => ({ id: 'txn-1', ...data })),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  return { prisma, resources, allocations };
}

describe('ResourcesService — atomic quantity guards', () => {
  it('allows an allocation up to exactly the remaining stock, then rejects the next one', async () => {
    const { prisma, resources } = makeFakeDb();
    resources.set('res-1', { id: 'res-1', remainingQuantity: 100, unit: 'bags' });
    const orgScope = new OrgScopeService(prisma as any);
    const auditService = { record: jest.fn() };
    const service = new ResourcesService(prisma as any, auditService as any, orgScope);
    const actor = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });

    const allocation = await service.createAllocation(
      { resourceId: 'res-1', quantity: 100, targetLevel: AllocationTargetLevel.LGA, targetId: 'lga-1' },
      actor,
    );
    expect(allocation.remainingQuantity).toBe(100);
    expect(resources.get('res-1')!.remainingQuantity).toBe(0);

    await expect(
      service.createAllocation(
        { resourceId: 'res-1', quantity: 1, targetLevel: AllocationTargetLevel.LGA, targetId: 'lga-1' },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RESOURCE_ALLOCATION_REJECTED' }),
    );
  });

  it('refuses an LGA_ADMIN allocating to a different LGA', async () => {
    const { prisma, resources } = makeFakeDb();
    resources.set('res-1', { id: 'res-1', remainingQuantity: 100, unit: 'bags' });
    prisma.lGA.findUnique.mockResolvedValue({ id: 'lga-2' });
    const orgScope = new OrgScopeService(prisma as any);
    const auditService = { record: jest.fn() };
    const service = new ResourcesService(prisma as any, auditService as any, orgScope);
    const actor = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });

    await expect(
      service.createAllocation(
        { resourceId: 'res-1', quantity: 10, targetLevel: AllocationTargetLevel.LGA, targetId: 'lga-2' },
        actor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets USAGE consume exactly the remaining allocation, then blocks over-usage', async () => {
    const { prisma, allocations } = makeFakeDb();
    allocations.set('alloc-1', {
      id: 'alloc-1',
      remainingQuantity: 50,
      targetLgaId: 'lga-1',
      targetWardId: null,
      targetPollingUnitId: null,
    });
    const orgScope = new OrgScopeService(prisma as any);
    const auditService = { record: jest.fn() };
    const service = new ResourcesService(prisma as any, auditService as any, orgScope);
    const actor = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });

    await service.createTransaction('alloc-1', { type: ResourceTransactionType.USAGE, quantity: 50 }, actor);
    expect(allocations.get('alloc-1')!.remainingQuantity).toBe(0);

    await expect(
      service.createTransaction('alloc-1', { type: ResourceTransactionType.USAGE, quantity: 1 }, actor),
    ).rejects.toThrow(BadRequestException);

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RESOURCE_TRANSACTION_REJECTED' }),
    );
  });

  it('allows a positive ADJUSTMENT to restore remaining quantity above the original', async () => {
    const { prisma, allocations } = makeFakeDb();
    allocations.set('alloc-1', {
      id: 'alloc-1',
      remainingQuantity: 0,
      targetLgaId: 'lga-1',
      targetWardId: null,
      targetPollingUnitId: null,
    });
    const orgScope = new OrgScopeService(prisma as any);
    const auditService = { record: jest.fn() };
    const service = new ResourcesService(prisma as any, auditService as any, orgScope);
    const actor = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });

    await service.createTransaction(
      'alloc-1',
      { type: ResourceTransactionType.ADJUSTMENT, quantity: 20 },
      actor,
    );
    expect(allocations.get('alloc-1')!.remainingQuantity).toBe(20);
  });

  it('rejects zero-quantity adjustments and non-positive usage', async () => {
    const { prisma, allocations } = makeFakeDb();
    allocations.set('alloc-1', {
      id: 'alloc-1',
      remainingQuantity: 10,
      targetLgaId: 'lga-1',
      targetWardId: null,
      targetPollingUnitId: null,
    });
    const orgScope = new OrgScopeService(prisma as any);
    const auditService = { record: jest.fn() };
    const service = new ResourcesService(prisma as any, auditService as any, orgScope);
    const actor = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });

    await expect(
      service.createTransaction('alloc-1', { type: ResourceTransactionType.ADJUSTMENT, quantity: 0 }, actor),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createTransaction('alloc-1', { type: ResourceTransactionType.USAGE, quantity: 0 }, actor),
    ).rejects.toThrow(BadRequestException);
  });
});
