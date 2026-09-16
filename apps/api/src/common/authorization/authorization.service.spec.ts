import { Role } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { OrgScopeService } from '../scope/org-scope.service';
import { AuthenticatedUser } from '../types/authenticated-user';

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
    lGA: { findUnique: jest.fn() },
    ward: { findUnique: jest.fn() },
    pollingUnit: { findUnique: jest.fn() },
    rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
    userPermission: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const auditService = { record: jest.fn() };
  const orgScope = new OrgScopeService(prisma as any);
  const service = new AuthorizationService(prisma as any, auditService as any, orgScope);
  return { service, prisma, auditService, orgScope };
}

describe('AuthorizationService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('canAssignRole', () => {
    it('allows a strictly-lower target role', () => {
      const { service } = makeDeps();
      expect(service.canAssignRole(makeActor({ role: Role.LGA_ADMIN }), Role.WARD_ADMIN)).toBe(true);
    });

    it('denies an equal-rank target role', () => {
      const { service } = makeDeps();
      expect(service.canAssignRole(makeActor({ role: Role.LGA_ADMIN }), Role.LGA_ADMIN)).toBe(false);
    });

    it('denies a higher-rank target role', () => {
      const { service } = makeDeps();
      expect(service.canAssignRole(makeActor({ role: Role.WARD_ADMIN }), Role.LGA_ADMIN)).toBe(false);
    });

    it('SUPER_ADMIN may assign any role, including SUPER_ADMIN', () => {
      const { service } = makeDeps();
      expect(service.canAssignRole(makeActor({ role: Role.SUPER_ADMIN }), Role.SUPER_ADMIN)).toBe(true);
    });
  });

  describe('canAssignScope', () => {
    it('allows a scope within the actor’s own primary scope', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.LGA_ADMIN, lgaId: 'akko' });
      await expect(service.canAssignScope(actor, { lgaId: 'akko' })).resolves.toBe(true);
    });

    it('denies a scope outside the actor’s own primary scope', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.LGA_ADMIN, lgaId: 'akko' });
      await expect(service.canAssignScope(actor, { lgaId: 'gombe' })).resolves.toBe(false);
    });

    it('allows a scope within an additional (multi-scope) grant', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.LGA_ADMIN, lgaId: 'akko', additionalScopes: [{ lgaId: 'yamaltu-deba' }] });
      await expect(service.canAssignScope(actor, { lgaId: 'yamaltu-deba' })).resolves.toBe(true);
    });

    it('SUPER_ADMIN can assign any scope', async () => {
      const { service } = makeDeps();
      await expect(
        service.canAssignScope(makeActor({ role: Role.SUPER_ADMIN }), { lgaId: 'anything' }),
      ).resolves.toBe(true);
    });
  });

  describe('permissions', () => {
    it('falls back to code defaults when RolePermission has no rows for the role', async () => {
      const { service } = makeDeps();
      const perms = await service.getRolePermissions(Role.WARD_ADMIN);
      expect(perms.has('members.view')).toBe(true);
      expect(perms.has('permissions.manage')).toBe(false);
    });

    it('uses DB RolePermission rows once they exist, ignoring the code defaults', async () => {
      const { service, prisma } = makeDeps();
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: 'members.view' }]);
      const perms = await service.getRolePermissions(Role.WARD_ADMIN);
      expect(perms).toEqual(new Set(['members.view']));
    });

    it('layers a GRANT override on top of the role default', async () => {
      const { service, prisma } = makeDeps();
      prisma.userPermission.findMany.mockResolvedValue([{ permission: 'permissions.manage', effect: 'GRANT' }]);
      const actor = makeActor({ role: Role.WARD_ADMIN });
      const perms = await service.getEffectivePermissions(actor);
      expect(perms.has('permissions.manage')).toBe(true);
    });

    it('applies a REVOKE override to remove a role-default permission', async () => {
      const { service, prisma } = makeDeps();
      prisma.userPermission.findMany.mockResolvedValue([{ permission: 'members.create', effect: 'REVOKE' }]);
      const actor = makeActor({ role: Role.WARD_ADMIN });
      const perms = await service.getEffectivePermissions(actor);
      expect(perms.has('members.create')).toBe(false);
    });

    it('hasPermission reflects the effective set', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.WARD_ADMIN });
      await expect(service.hasPermission(actor, 'members.view')).resolves.toBe(true);
      await expect(service.hasPermission(actor, 'permissions.manage')).resolves.toBe(false);
    });

    it('hasPermission rejects an unknown permission string outright', async () => {
      const { service } = makeDeps();
      await expect(service.hasPermission(makeActor({ role: Role.SUPER_ADMIN }), 'members.delete_everything')).resolves.toBe(
        false,
      );
    });
  });

  describe('canGrantPermission', () => {
    it('SUPER_ADMIN can grant any permission it possesses', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.SUPER_ADMIN });
      await expect(service.canGrantPermission(actor, 'permissions.manage')).resolves.toBe(true);
    });

    it('a SENATORIAL_ADMIN can delegate an operational permission it possesses', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'd1' });
      await expect(service.canGrantPermission(actor, 'members.create')).resolves.toBe(true);
    });

    it('a SENATORIAL_ADMIN cannot delegate users.create (not on the delegable allowlist)', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'd1' });
      await expect(service.canGrantPermission(actor, 'users.create')).resolves.toBe(false);
    });

    it('cannot grant a permission the actor does not themselves possess', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1' });
      // POLLING_UNIT_OFFICER's default set has no `resources.manage`
      await expect(service.canGrantPermission(actor, 'resources.manage')).resolves.toBe(false);
    });
  });

  describe('canCreateUser / canUpdateUser — structured decisions with reason codes', () => {
    it('returns a TARGET_ROLE_AUTHORITY_TOO_HIGH reason on a rank violation', async () => {
      const { service, auditService } = makeDeps();
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'd1' });
      const decision = await service.canCreateUser(actor, Role.SUPER_ADMIN, {});
      expect(decision).toMatchObject({ allowed: false, reasonCode: 'TARGET_ROLE_AUTHORITY_TOO_HIGH' });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_MANAGEMENT_DENIED',
          metadata: expect.objectContaining({ reasonCode: 'TARGET_ROLE_AUTHORITY_TOO_HIGH' }),
        }),
      );
    });

    it('returns a GEOGRAPHIC_SCOPE_VIOLATION reason on a scope violation', async () => {
      const { service, prisma } = makeDeps();
      prisma.lGA.findUnique.mockResolvedValue({ senatorialDistrictId: 'gombe-north' });
      const actor = makeActor({ role: Role.SENATORIAL_ADMIN, senatorialDistrictId: 'gombe-central' });
      const decision = await service.canCreateUser(actor, Role.LGA_ADMIN, { lgaId: 'gombe-lga' });
      expect(decision).toMatchObject({ allowed: false, reasonCode: 'GEOGRAPHIC_SCOPE_VIOLATION' });
    });

    it('returns PU_OFFICER_NOT_GRANTED when the officer lacks the creation grant', async () => {
      const { service } = makeDeps();
      const actor = makeActor({ role: Role.POLLING_UNIT_OFFICER, pollingUnitId: 'pu-1', canCreateUsers: false });
      const decision = await service.canCreateUser(actor, Role.DATA_ENTRY_OFFICER, { pollingUnitId: 'pu-1' });
      expect(decision).toMatchObject({ allowed: false, reasonCode: 'PU_OFFICER_NOT_GRANTED' });
    });

    it('returns allowed: true with no reason code and no audit entry for a valid request', async () => {
      const { service, prisma, auditService } = makeDeps();
      prisma.pollingUnit.findUnique.mockResolvedValue({ wardId: 'ward-x' });
      const actor = makeActor({ role: Role.WARD_ADMIN, wardId: 'ward-x' });
      const decision = await service.canCreateUser(actor, Role.POLLING_UNIT_OFFICER, { pollingUnitId: 'pu-in-x' });
      expect(decision).toEqual({ allowed: true });
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });
});
