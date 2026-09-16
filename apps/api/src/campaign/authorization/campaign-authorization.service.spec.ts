import { ForbiddenException } from '@nestjs/common';
import { CampaignRole } from '@prisma/client';
import { CampaignAuthorizationService, CampaignMembershipLike } from './campaign-authorization.service';

function makeMembership(overrides: Partial<CampaignMembershipLike>): CampaignMembershipLike {
  return {
    id: 'membership-1',
    campaignId: 'campaign-1',
    userId: 'user-1',
    role: CampaignRole.WARD_COORDINATOR,
    status: 'ACTIVE',
    senatorialDistrictId: null,
    lgaId: null,
    wardId: null,
    pollingUnitId: null,
    ...overrides,
  };
}

function makeDeps() {
  const prisma = {
    campaignMembership: { findUnique: jest.fn() },
    lGA: { findUnique: jest.fn() },
    ward: { findUnique: jest.fn() },
    pollingUnit: { findUnique: jest.fn() },
    campaignRolePermission: { findMany: jest.fn().mockResolvedValue([]) },
    campaignMembershipPermission: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const auditService = { record: jest.fn() };
  const service = new CampaignAuthorizationService(prisma as any, auditService as any);
  return { service, prisma, auditService };
}

describe('CampaignAuthorizationService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('role authority', () => {
    it('CAMPAIGN_SUPER_ADMIN may assign any role, including itself', () => {
      const { service } = makeDeps();
      expect(service.canAssignCampaignRole(CampaignRole.CAMPAIGN_SUPER_ADMIN, CampaignRole.CAMPAIGN_SUPER_ADMIN)).toBe(true);
    });

    it('STATE_CAMPAIGN_COORDINATOR cannot create another STATE_CAMPAIGN_COORDINATOR', () => {
      const { service } = makeDeps();
      expect(
        service.canAssignCampaignRole(CampaignRole.STATE_CAMPAIGN_COORDINATOR, CampaignRole.STATE_CAMPAIGN_COORDINATOR),
      ).toBe(false);
    });

    it('STATE_CAMPAIGN_COORDINATOR cannot create CAMPAIGN_SUPER_ADMIN', () => {
      const { service } = makeDeps();
      expect(
        service.canAssignCampaignRole(CampaignRole.STATE_CAMPAIGN_COORDINATOR, CampaignRole.CAMPAIGN_SUPER_ADMIN),
      ).toBe(false);
    });

    it('DISTRICT_COORDINATOR may create LGA_COORDINATOR but not another DISTRICT_COORDINATOR', () => {
      const { service } = makeDeps();
      expect(service.canAssignCampaignRole(CampaignRole.DISTRICT_COORDINATOR, CampaignRole.LGA_COORDINATOR)).toBe(true);
      expect(service.canAssignCampaignRole(CampaignRole.DISTRICT_COORDINATOR, CampaignRole.DISTRICT_COORDINATOR)).toBe(false);
    });

    it('a geographic coordinator may assign a functional specialist role within their tier', () => {
      const { service } = makeDeps();
      expect(service.canAssignCampaignRole(CampaignRole.WARD_COORDINATOR, CampaignRole.EVENT_COORDINATOR)).toBe(true);
    });

    it('functional specialist roles can never manage another campaign user', () => {
      const { service } = makeDeps();
      expect(service.canAssignCampaignRole(CampaignRole.EVENT_COORDINATOR, CampaignRole.REPORT_VIEWER)).toBe(false);
      expect(service.canAssignCampaignRole(CampaignRole.EVENT_COORDINATOR, CampaignRole.POLLING_UNIT_COORDINATOR)).toBe(false);
    });

    it('POLLING_UNIT_COORDINATOR cannot create another POLLING_UNIT_COORDINATOR', () => {
      const { service } = makeDeps();
      expect(
        service.canAssignCampaignRole(CampaignRole.POLLING_UNIT_COORDINATOR, CampaignRole.POLLING_UNIT_COORDINATOR),
      ).toBe(false);
    });
  });

  describe('worked examples — role + geographic scope (mirrors spec section 5/18)', () => {
    it('DISTRICT_COORDINATOR(Gombe Central) creating LGA_COORDINATOR(Akko) → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      prisma.lGA.findUnique.mockResolvedValue({ senatorialDistrictId: 'gombe-central' });
      const actor = makeMembership({ role: CampaignRole.DISTRICT_COORDINATOR, senatorialDistrictId: 'gombe-central' });
      const decision = await service.evaluateMembershipChange(actor, CampaignRole.LGA_COORDINATOR, { lgaId: 'akko' });
      expect(decision.allowed).toBe(true);
    });

    it('DISTRICT_COORDINATOR(Gombe Central) creating LGA_COORDINATOR(Gombe LGA, in Gombe North) → DENY', async () => {
      const { service, prisma } = makeDeps();
      prisma.lGA.findUnique.mockResolvedValue({ senatorialDistrictId: 'gombe-north' });
      const actor = makeMembership({ role: CampaignRole.DISTRICT_COORDINATOR, senatorialDistrictId: 'gombe-central' });
      const decision = await service.evaluateMembershipChange(actor, CampaignRole.LGA_COORDINATOR, { lgaId: 'gombe-lga' });
      expect(decision).toMatchObject({ allowed: false, reasonCode: 'GEOGRAPHIC_SCOPE_VIOLATION' });
    });

    it('DISTRICT_COORDINATOR creating CAMPAIGN_SUPER_ADMIN → DENY (TARGET_ROLE_AUTHORITY_TOO_HIGH)', async () => {
      const { service } = makeDeps();
      const actor = makeMembership({ role: CampaignRole.DISTRICT_COORDINATOR, senatorialDistrictId: 'gombe-central' });
      const decision = await service.evaluateMembershipChange(actor, CampaignRole.CAMPAIGN_SUPER_ADMIN, {});
      expect(decision).toMatchObject({ allowed: false, reasonCode: 'TARGET_ROLE_AUTHORITY_TOO_HIGH' });
    });

    it('LGA_COORDINATOR(Akko) creating WARD_COORDINATOR(ward in Akko) → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      prisma.ward.findUnique.mockResolvedValue({ lgaId: 'akko' });
      const actor = makeMembership({ role: CampaignRole.LGA_COORDINATOR, lgaId: 'akko' });
      const decision = await service.evaluateMembershipChange(actor, CampaignRole.WARD_COORDINATOR, { wardId: 'ward-in-akko' });
      expect(decision.allowed).toBe(true);
    });

    it('LGA_COORDINATOR(Akko) creating WARD_COORDINATOR(ward outside Akko) → DENY', async () => {
      const { service, prisma } = makeDeps();
      prisma.ward.findUnique.mockResolvedValue({ lgaId: 'gombe-lga' });
      const actor = makeMembership({ role: CampaignRole.LGA_COORDINATOR, lgaId: 'akko' });
      const decision = await service.evaluateMembershipChange(actor, CampaignRole.WARD_COORDINATOR, { wardId: 'ward-outside' });
      expect(decision).toMatchObject({ allowed: false, reasonCode: 'GEOGRAPHIC_SCOPE_VIOLATION' });
    });

    it('WARD_COORDINATOR(Ward X) creating POLLING_UNIT_COORDINATOR(PU in Ward X) → ALLOW', async () => {
      const { service, prisma } = makeDeps();
      prisma.pollingUnit.findUnique.mockResolvedValue({ wardId: 'ward-x' });
      const actor = makeMembership({ role: CampaignRole.WARD_COORDINATOR, wardId: 'ward-x' });
      const decision = await service.evaluateMembershipChange(actor, CampaignRole.POLLING_UNIT_COORDINATOR, { pollingUnitId: 'pu-in-x' });
      expect(decision.allowed).toBe(true);
    });

    it('WARD_COORDINATOR(Ward X) creating POLLING_UNIT_COORDINATOR(PU in Ward Y) → DENY', async () => {
      const { service, prisma } = makeDeps();
      prisma.pollingUnit.findUnique.mockResolvedValue({ wardId: 'ward-y' });
      const actor = makeMembership({ role: CampaignRole.WARD_COORDINATOR, wardId: 'ward-x' });
      const decision = await service.evaluateMembershipChange(actor, CampaignRole.POLLING_UNIT_COORDINATOR, { pollingUnitId: 'pu-in-y' });
      expect(decision).toMatchObject({ allowed: false, reasonCode: 'GEOGRAPHIC_SCOPE_VIOLATION' });
    });
  });

  describe('IDOR / BOLA prevention (spec section 18)', () => {
    it('rejects GET on an event outside the DISTRICT_COORDINATOR’s district, even with a known id', async () => {
      const { service, prisma } = makeDeps();
      prisma.lGA.findUnique.mockResolvedValue({ senatorialDistrictId: 'gombe-north' });
      const actor = makeMembership({ role: CampaignRole.DISTRICT_COORDINATOR, senatorialDistrictId: 'gombe-central' });

      await expect(
        service.assertCanAccessCampaignScope(actor, { lgaId: 'gombe-lga' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects GET on a team outside a WARD_COORDINATOR’s ward', async () => {
      const { service } = makeDeps();
      const actor = makeMembership({ role: CampaignRole.WARD_COORDINATOR, wardId: 'ward-x' });
      await expect(service.assertCanAccessCampaignScope(actor, { wardId: 'ward-y' })).rejects.toThrow(ForbiddenException);
    });

    it('allows GET on a resource within scope', async () => {
      const { service } = makeDeps();
      const actor = makeMembership({ role: CampaignRole.WARD_COORDINATOR, wardId: 'ward-x' });
      await expect(service.assertCanAccessCampaignScope(actor, { wardId: 'ward-x' })).resolves.not.toThrow();
    });

    it('an unrestricted STATE_CAMPAIGN_COORDINATOR can access anything', async () => {
      const { service } = makeDeps();
      const actor = makeMembership({ role: CampaignRole.STATE_CAMPAIGN_COORDINATOR });
      await expect(service.assertCanAccessCampaignScope(actor, { pollingUnitId: 'anything' })).resolves.not.toThrow();
    });
  });

  describe('membership lookup', () => {
    it('throws when the caller has no membership on this campaign', async () => {
      const { service, prisma } = makeDeps();
      prisma.campaignMembership.findUnique.mockResolvedValue(null);
      await expect(
        service.requireActiveMembership({ id: 'u1' } as any, 'campaign-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws when the membership is disabled', async () => {
      const { service, prisma } = makeDeps();
      prisma.campaignMembership.findUnique.mockResolvedValue(makeMembership({ status: 'DISABLED' }));
      await expect(
        service.requireActiveMembership({ id: 'u1' } as any, 'campaign-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns the membership when active', async () => {
      const { service, prisma } = makeDeps();
      const membership = makeMembership({});
      prisma.campaignMembership.findUnique.mockResolvedValue(membership);
      await expect(service.requireActiveMembership({ id: 'u1' } as any, 'campaign-1')).resolves.toEqual(membership);
    });
  });

  describe('permissions', () => {
    it('falls back to code defaults when CampaignRolePermission has no rows', async () => {
      const { service } = makeDeps();
      const perms = await service.getCampaignRolePermissions(CampaignRole.REPORT_VIEWER);
      expect(perms).toEqual(new Set(['campaign.dashboard.view', 'campaign.reports.view']));
    });

    it('layers a GRANT override on top of the role default', async () => {
      const { service, prisma } = makeDeps();
      prisma.campaignMembershipPermission.findMany.mockResolvedValue([{ permission: 'campaign.events.create', effect: 'GRANT' }]);
      const perms = await service.getEffectiveCampaignPermissions(makeMembership({ role: CampaignRole.REPORT_VIEWER }));
      expect(perms.has('campaign.events.create')).toBe(true);
    });

    it('applies a REVOKE override', async () => {
      const { service, prisma } = makeDeps();
      prisma.campaignMembershipPermission.findMany.mockResolvedValue([{ permission: 'campaign.reports.view', effect: 'REVOKE' }]);
      const perms = await service.getEffectiveCampaignPermissions(makeMembership({ role: CampaignRole.REPORT_VIEWER }));
      expect(perms.has('campaign.reports.view')).toBe(false);
    });

    it('rejects an unknown permission string outright', async () => {
      const { service } = makeDeps();
      await expect(
        service.hasCampaignPermission(makeMembership({ role: CampaignRole.CAMPAIGN_SUPER_ADMIN }), 'campaign.delete_everything'),
      ).resolves.toBe(false);
    });
  });

  describe('multi-level scope resolution (functional roles)', () => {
    it('resolves a functional role’s scope to whichever field is set, most specific first', () => {
      const { service } = makeDeps();
      const actor = makeMembership({ role: CampaignRole.EVENT_COORDINATOR, lgaId: 'akko', pollingUnitId: 'pu-1', wardId: 'ward-1' });
      expect(service.resolveActorScope(actor)).toEqual({ level: 'POLLING_UNIT', id: 'pu-1' });
    });

    it('an unconfigured functional role has NONE scope', () => {
      const { service } = makeDeps();
      const actor = makeMembership({ role: CampaignRole.EVENT_COORDINATOR });
      expect(service.resolveActorScope(actor)).toEqual({ level: 'NONE' });
    });
  });
});
