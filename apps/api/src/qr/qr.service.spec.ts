import { QrService } from './qr.service';

// Unit tests exercise token issuance/resolution logic, not the `qrcode`
// package's actual PNG encoding — mock it so this suite's timing doesn't
// depend on real image-rendering performance.
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

function makePrismaMock() {
  const store = new Map<string, { memberId: string; token: string; status: string }>();
  return {
    memberQRCode: {
      upsert: jest.fn().mockImplementation(async ({ where, create }: any) => {
        const record = { memberId: where.memberId, token: create.token, status: 'ACTIVE' };
        store.set(where.memberId, record);
        return record;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.memberId) return store.get(where.memberId) ?? null;
        if (where.token) {
          return [...store.values()].find((r) => r.token === where.token) ?? null;
        }
        return null;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => {
        const record = store.get(where.memberId);
        if (!record) throw new Error('not found');
        Object.assign(record, data);
        return record;
      }),
    },
  };
}

describe('QrService', () => {
  it('issues an opaque token that resolves back to the member', async () => {
    const prisma = makePrismaMock();
    const audit = { record: jest.fn() };
    const service = new QrService(prisma as any, audit as any);

    const { token } = await service.issueForMember('member-1');
    expect(token).toBeTruthy();
    expect(token).not.toContain('member-1');

    const resolved = await service.resolveToken(token);
    expect(resolved).toEqual({ memberId: 'member-1' });
  });

  it('refuses to resolve a revoked token', async () => {
    const prisma = makePrismaMock();
    const audit = { record: jest.fn() };
    const service = new QrService(prisma as any, audit as any);

    const { token } = await service.issueForMember('member-1');
    await service.revokeForMember('member-1', 'actor-1');

    expect(await service.resolveToken(token)).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MEMBER_QR_REVOKED', entityId: 'member-1' }),
    );
  });

  it('returns null for a token that was never issued', async () => {
    const prisma = makePrismaMock();
    const audit = { record: jest.fn() };
    const service = new QrService(prisma as any, audit as any);

    expect(await service.resolveToken('nonexistent-token')).toBeNull();
  });

  it('invalidates the previous token when reissuing', async () => {
    const prisma = makePrismaMock();
    const audit = { record: jest.fn() };
    const service = new QrService(prisma as any, audit as any);

    const first = await service.issueForMember('member-1');
    const second = await service.reissueForMember('member-1', 'actor-1');

    expect(second.token).not.toBe(first.token);
    expect(await service.resolveToken(first.token)).toBeNull();
    expect(await service.resolveToken(second.token)).toEqual({ memberId: 'member-1' });
  });
});
