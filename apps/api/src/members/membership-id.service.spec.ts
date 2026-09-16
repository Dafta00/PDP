import { MembershipIdService } from './membership-id.service';

describe('MembershipIdService', () => {
  it('formats the ID as PDP-GC-<year>-<padded sequence> for Gombe Central', async () => {
    const prisma = {
      counter: {
        upsert: jest.fn().mockResolvedValue({ id: 'member-2026', value: 1 }),
      },
    } as any;

    const service = new MembershipIdService(prisma);
    const id = await service.next('Gombe Central', 2026);

    expect(id).toBe('PDP-GC-2026-000001');
    expect(prisma.counter.upsert).toHaveBeenCalledWith({
      where: { id: 'member-2026' },
      create: { id: 'member-2026', value: 1 },
      update: { value: { increment: 1 } },
    });
  });

  it('uses a distinct counter and prefix for Gombe North and South', async () => {
    const prisma = {
      counter: {
        upsert: jest.fn().mockImplementation(async ({ where }: any) => ({ id: where.id, value: 1 })),
      },
    } as any;

    const service = new MembershipIdService(prisma);

    expect(await service.next('Gombe North', 2026)).toBe('PDP-GN-2026-000001');
    expect(await service.next('Gombe South', 2026)).toBe('PDP-GS-2026-000001');
    expect(prisma.counter.upsert).toHaveBeenCalledWith({
      where: { id: 'member-2026-GN' },
      create: { id: 'member-2026-GN', value: 1 },
      update: { value: { increment: 1 } },
    });
    expect(prisma.counter.upsert).toHaveBeenCalledWith({
      where: { id: 'member-2026-GS' },
      create: { id: 'member-2026-GS', value: 1 },
      update: { value: { increment: 1 } },
    });
  });

  it("Gombe Central's counter key is unchanged by the district expansion (existing IDs keep their sequence)", async () => {
    const prisma = {
      counter: {
        upsert: jest.fn().mockResolvedValue({ id: 'member-2026', value: 5 }),
      },
    } as any;

    const service = new MembershipIdService(prisma);
    await service.next('Gombe Central', 2026);

    expect(prisma.counter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'member-2026' } }),
    );
  });

  it('produces sequential, non-repeating IDs as the counter increments', async () => {
    let value = 0;
    const prisma = {
      counter: {
        upsert: jest.fn().mockImplementation(async () => {
          value += 1;
          return { id: 'member-2026', value };
        }),
      },
    } as any;

    const service = new MembershipIdService(prisma);
    const ids = await Promise.all([
      service.next('Gombe Central', 2026),
      service.next('Gombe Central', 2026),
      service.next('Gombe Central', 2026),
    ]);

    expect(new Set(ids).size).toBe(3);
    expect(ids.sort()).toEqual([
      'PDP-GC-2026-000001',
      'PDP-GC-2026-000002',
      'PDP-GC-2026-000003',
    ]);
  });

  it('scopes the sequence per year', async () => {
    const prisma = {
      counter: {
        upsert: jest.fn().mockImplementation(async ({ where }: any) => ({
          id: where.id,
          value: 1,
        })),
      },
    } as any;

    const service = new MembershipIdService(prisma);
    expect(await service.next('Gombe Central', 2026)).toBe('PDP-GC-2026-000001');
    expect(await service.next('Gombe Central', 2027)).toBe('PDP-GC-2027-000001');
  });
});
