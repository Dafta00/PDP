import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, CampaignRole } from '@prisma/client';
import { CampaignMembershipsService } from './campaign-memberships.service';
import { CampaignAuthorizationService } from './authorization/campaign-authorization.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

function makeActor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'actor-user-1',
    email: 'a@example.com',
    role: Role.WARD_ADMIN,
    senatorialDistrictId: null,
    lgaId: null,
    wardId: null,
    pollingUnitId: null,
    ...overrides,
  };
}

function makeDeps() {
  const prisma = {
    campaignMembership: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    lGA: { findUnique: jest.fn() },
    ward: { findUnique: jest.fn() },
    pollingUnit: { findUnique: jest.fn() },
    campaignRolePermission: { findMany: jest.fn().mockResolvedValue([]) },
    campaignMembershipPermission: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const auditService = { record: jest.fn() };
  const campaignAuthorization = new CampaignAuthorizationService(prisma as any, auditService as any);
  const service = new CampaignMembershipsService(prisma as any, auditService as any, campaignAuthorization);
  return { service, prisma, auditService, campaignAuthorization };
}

describe('CampaignMembershipsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a membership when the actor is authorized', async () => {
    const { service, prisma } = makeDeps();
    prisma.campaignMembership.findUnique
      .mockResolvedValueOnce({ id: 'actor-m1', campaignId: 'c1', userId: 'actor-user-1', role: CampaignRole.LGA_COORDINATOR, status: 'ACTIVE', senatorialDistrictId: null, lgaId: 'akko', wardId: null, pollingUnitId: null })
      .mockResolvedValueOnce(null); // no existing membership for the target user
    prisma.ward.findUnique.mockResolvedValue({ lgaId: 'akko' });
    prisma.campaignMembership.create.mockResolvedValue({ id: 'new-m', role: CampaignRole.WARD_COORDINATOR });

    const actor = makeActor();
    const result = await service.create(
      'c1',
      { userId: 'target-user', role: CampaignRole.WARD_COORDINATOR, wardId: 'ward-in-akko' } as any,
      actor,
    );

    expect(result).toBeDefined();
    expect(prisma.campaignMembership.create).toHaveBeenCalled();
  });

  it('denies creating a membership outside the actor’s campaign scope', async () => {
    const { service, prisma } = makeDeps();
    prisma.campaignMembership.findUnique.mockResolvedValueOnce({
      id: 'actor-m1', campaignId: 'c1', userId: 'actor-user-1', role: CampaignRole.LGA_COORDINATOR, status: 'ACTIVE', senatorialDistrictId: null, lgaId: 'akko', wardId: null, pollingUnitId: null,
    });
    prisma.ward.findUnique.mockResolvedValue({ lgaId: 'gombe-lga' });

    await expect(
      service.create('c1', { userId: 'target-user', role: CampaignRole.WARD_COORDINATOR, wardId: 'ward-outside' } as any, makeActor()),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a self role change, even to the same role', async () => {
    const { service, prisma } = makeDeps();
    const actor = makeActor();
    prisma.campaignMembership.findUnique.mockResolvedValueOnce({
      id: 'self-m', campaignId: 'c1', userId: actor.id, role: CampaignRole.DISTRICT_COORDINATOR, status: 'ACTIVE', senatorialDistrictId: 'd1', lgaId: null, wardId: null, pollingUnitId: null,
    }); // requireActiveMembership lookup for the actor
    prisma.campaignMembership.findUnique.mockResolvedValueOnce({
      id: 'self-m', campaignId: 'c1', userId: actor.id, role: CampaignRole.DISTRICT_COORDINATOR, status: 'ACTIVE', senatorialDistrictId: 'd1', lgaId: null, wardId: null, pollingUnitId: null,
    }); // existing lookup for the target (self)

    await expect(
      service.update('c1', 'self-m', { role: CampaignRole.DISTRICT_COORDINATOR } as any, actor),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects updating a membership that belongs to a different campaign (IDOR)', async () => {
    const { service, prisma } = makeDeps();
    const actor = makeActor();
    prisma.campaignMembership.findUnique
      .mockResolvedValueOnce({ id: 'actor-m1', campaignId: 'c1', userId: actor.id, role: CampaignRole.STATE_CAMPAIGN_COORDINATOR, status: 'ACTIVE', senatorialDistrictId: null, lgaId: null, wardId: null, pollingUnitId: null })
      .mockResolvedValueOnce({ id: 'other-m', campaignId: 'c2', userId: 'someone-else', role: CampaignRole.WARD_COORDINATOR, status: 'ACTIVE', senatorialDistrictId: null, lgaId: null, wardId: 'ward-1', pollingUnitId: null });

    await expect(
      service.update('c1', 'other-m', { status: 'DISABLED' } as any, actor),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects creating a fixed-scope role with no scope id', async () => {
    const { service, prisma } = makeDeps();
    prisma.campaignMembership.findUnique.mockResolvedValueOnce({
      id: 'actor-m1', campaignId: 'c1', userId: 'actor-user-1', role: CampaignRole.STATE_CAMPAIGN_COORDINATOR, status: 'ACTIVE', senatorialDistrictId: null, lgaId: null, wardId: null, pollingUnitId: null,
    });

    await expect(
      service.create('c1', { userId: 'target-user', role: CampaignRole.LGA_COORDINATOR } as any, makeActor()),
    ).rejects.toThrow(BadRequestException);
  });
});
