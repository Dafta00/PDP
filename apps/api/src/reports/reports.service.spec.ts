import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
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

const LGAS = [
  { id: 'lga-1', name: 'Akko' },
  { id: 'lga-2', name: 'Yamaltu/Deba' },
];
const WARDS = [
  { id: 'ward-nono', name: 'Nono Ward', lgaId: 'lga-1' },
  { id: 'ward-kumo', name: 'Kumo Ward', lgaId: 'lga-1' },
];

// Members: 5 in Nono Ward (lga-1), 3 in Kumo Ward (lga-1).
const MEMBER_COUNTS: Record<string, number> = {
  'lgaId=lga-1': 8,
  'lgaId=lga-2': 0,
  'wardId=ward-nono': 5,
  'wardId=ward-kumo': 3,
};

function makeService() {
  const prisma: any = {
    pollingUnit: { findUnique: jest.fn() },
    member: {
      count: jest.fn(async ({ where }: any) => {
        // Simulate a real DB: an impossible AND of conflicting wardId values
        // (the bug's signature) must return 0, never a leaked count.
        if (where.lgaId && where.wardId) {
          const wardMatchesLga = WARDS.find((w) => w.id === where.wardId)?.lgaId === where.lgaId;
          if (!wardMatchesLga) return 0;
          return MEMBER_COUNTS[`wardId=${where.wardId}`] ?? 0;
        }
        if (where.wardId) return MEMBER_COUNTS[`wardId=${where.wardId}`] ?? 0;
        if (where.lgaId) return MEMBER_COUNTS[`lgaId=${where.lgaId}`] ?? 0;
        if (where.status) return 0;
        return 8; // unrestricted total
      }),
    },
    lGA: { findMany: jest.fn(async () => LGAS) },
    ward: {
      findMany: jest.fn(async () => WARDS),
      findUnique: jest.fn(async ({ where: { id } }: any) => {
        const w = WARDS.find((ward) => ward.id === id);
        return w ? { lgaId: w.lgaId } : null;
      }),
    },
    $queryRaw: jest.fn(async () => []),
  };
  const orgScope = new OrgScopeService(prisma);
  const service = new ReportsService(prisma, orgScope);
  return { service, prisma };
}

describe('ReportsService.getMembershipReport — org-scope correctness', () => {
  it("does not leak another ward's count into a WARD_ADMIN's own-ward row", async () => {
    const { service } = makeService();
    const kumoWardAdmin = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-kumo' });

    const report = await service.getMembershipReport(kumoWardAdmin);

    // Only their own ward should appear at all.
    expect(report.byWard.map((w) => w.wardId)).toEqual(['ward-kumo']);
    expect(report.byWard[0].total).toBe(3);
  });

  it("restricts a WARD_ADMIN's byLga breakdown to their own LGA only", async () => {
    const { service } = makeService();
    const kumoWardAdmin = makeUser({ role: Role.WARD_ADMIN, wardId: 'ward-kumo' });

    const report = await service.getMembershipReport(kumoWardAdmin);

    expect(report.byLga.map((l) => l.lgaId)).toEqual(['lga-1']);
  });

  it('shows an LGA_ADMIN their own LGA with the correct total, not another LGA\'s', async () => {
    const { service } = makeService();
    const lgaAdmin = makeUser({ role: Role.LGA_ADMIN, lgaId: 'lga-1' });

    const report = await service.getMembershipReport(lgaAdmin);

    expect(report.byLga).toEqual([{ lgaId: 'lga-1', name: 'Akko', total: 8 }]);
  });

  it('gives an unrestricted admin the full breakdown across all units', async () => {
    const { service } = makeService();
    const superAdmin = makeUser({ role: Role.SUPER_ADMIN });

    const report = await service.getMembershipReport(superAdmin);

    expect(report.byLga.map((l) => l.lgaId).sort()).toEqual(['lga-1', 'lga-2']);
    expect(report.byWard.map((w) => w.wardId).sort()).toEqual(['ward-kumo', 'ward-nono']);
  });
});
