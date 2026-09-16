import { Role } from './auth-context';

/**
 * Mirrors the backend's authority ordering (UsersService.ROLE_HIERARCHY) so
 * the Create User form only ever offers roles/scope levels the actor is
 * allowed to assign. This is a UX convenience only — the API independently
 * re-validates every request against the same rules, which is the actual
 * security boundary.
 */
export const ROLE_HIERARCHY: Role[] = [
  'SUPER_ADMIN',
  'STATE_ADMIN',
  'SENATORIAL_ADMIN',
  'LGA_ADMIN',
  'WARD_ADMIN',
  'POLLING_UNIT_OFFICER',
  'DATA_ENTRY_OFFICER',
];

export function rankOf(role: Role): number {
  return ROLE_HIERARCHY.indexOf(role);
}

/** Roles `actorRole` is permitted to create/assign — strictly below it, except SUPER_ADMIN which may assign any role. */
export function assignableRoles(actorRole: Role): Role[] {
  if (actorRole === 'SUPER_ADMIN') return ROLE_HIERARCHY;
  return ROLE_HIERARCHY.filter((r) => rankOf(r) > rankOf(actorRole));
}

export type ScopeField = 'senatorialDistrictId' | 'lgaId' | 'wardId' | 'pollingUnitId';

export const SCOPE_FIELD: Partial<Record<Role, ScopeField>> = {
  SENATORIAL_ADMIN: 'senatorialDistrictId',
  LGA_ADMIN: 'lgaId',
  WARD_ADMIN: 'wardId',
  POLLING_UNIT_OFFICER: 'pollingUnitId',
};

/** The actor's own scope level, as a scope-field name — null for unrestricted (SUPER_ADMIN/STATE_ADMIN) or unmanaged roles. */
export function actorScopeField(actorRole: Role): ScopeField | null {
  return SCOPE_FIELD[actorRole] ?? null;
}
