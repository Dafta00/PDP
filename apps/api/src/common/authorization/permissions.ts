import { Role } from '@prisma/client';

/**
 * The full permission catalog. Every permission checked anywhere in the app
 * must be a member of this list — `AuthorizationService.hasPermission`
 * treats anything else as unknown and denies it, so this is the single
 * source of truth for "what a permission string is allowed to be".
 */
export const PERMISSIONS = [
  'dashboard.view',

  'members.view',
  'members.create',
  'members.update',
  'members.deactivate',
  'members.verify',
  'members.export',

  'organization.view',
  'organization.manage',

  'geography.view',
  'geography.manage',

  'events.view',
  'events.create',
  'events.update',
  'events.delete',
  'attendance.manage',

  'resources.view',
  'resources.create',
  'resources.update',
  'resources.manage',

  'allocations.view',
  'allocations.create',
  'allocations.approve',

  'distributions.view',
  'distributions.create',
  'distributions.verify',
  'distributions.cancel',

  'reports.view',
  'reports.generate',
  'reports.export',

  'users.view',
  'users.create',
  'users.update',
  'users.deactivate',

  'roles.view',
  'roles.create',
  'roles.update',
  'roles.delete',

  'permissions.view',
  'permissions.manage',

  'audit.view',

  'settings.view',
  'settings.manage',

  // Admin-only internal messaging — actual recipient eligibility is still
  // enforced per-message by OrgScopeService.canCommunicateWith; these two
  // permissions only gate "may use the messaging module at all".
  'messages.view',
  'messages.send',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

const ALL: Permission[] = [...PERMISSIONS];
const OPERATIONAL: Permission[] = [
  'dashboard.view',
  'members.view',
  'members.create',
  'members.update',
  'members.deactivate',
  'members.verify',
  'members.export',
  'organization.view',
  'geography.view',
  'events.view',
  'events.create',
  'events.update',
  'events.delete',
  'attendance.manage',
  'resources.view',
  'resources.create',
  'resources.update',
  'resources.manage',
  'allocations.view',
  'allocations.create',
  'allocations.approve',
  'distributions.view',
  'distributions.create',
  'distributions.verify',
  'distributions.cancel',
  'reports.view',
  'reports.generate',
  'reports.export',
  'users.view',
  'messages.view',
  'messages.send',
];

/**
 * Seed defaults for RolePermission — applied by `prisma/seed.ts` and used as
 * a fallback by AuthorizationService when the DB table is empty for a role
 * (e.g. a fresh dev DB nobody has reseeded yet), so the app never silently
 * grants zero permissions. Once RolePermission rows exist for a role, the DB
 * is authoritative and a SUPER_ADMIN can adjust them without a deploy.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: ALL,
  // Everything except the two things this codebase treats as strictly
  // SUPER_ADMIN-only regardless of what permission a role happens to carry:
  // system settings and editing a ROLE's default permission set (see
  // AuthorizationService.setRolePermissions). STATE_ADMIN keeps
  // permissions.view so it can still see the catalog/current defaults.
  [Role.STATE_ADMIN]: ALL.filter((p) => p !== 'settings.manage' && p !== 'permissions.manage'),
  [Role.SENATORIAL_ADMIN]: [
    ...OPERATIONAL,
    'organization.manage',
    'geography.manage',
    'users.create',
    'users.update',
    'users.deactivate',
    'audit.view',
  ],
  [Role.LGA_ADMIN]: [
    ...OPERATIONAL,
    'organization.manage',
    'geography.manage',
    'users.create',
    'users.update',
    'users.deactivate',
  ],
  [Role.WARD_ADMIN]: [...OPERATIONAL, 'geography.manage', 'users.create', 'users.update'],
  [Role.POLLING_UNIT_OFFICER]: [
    'dashboard.view',
    'members.view',
    'members.create',
    'members.update',
    'members.verify',
    'organization.view',
    'geography.view',
    'events.view',
    'attendance.manage',
    'resources.view',
    'distributions.view',
    'distributions.verify',
    'reports.view',
    'messages.view',
    'messages.send',
  ],
  [Role.DATA_ENTRY_OFFICER]: [
    'dashboard.view',
    'members.view',
    'members.create',
    'members.update',
    'organization.view',
    'geography.view',
    'events.view',
    'attendance.manage',
    'reports.view',
    'messages.view',
    'messages.send',
  ],
};

/**
 * Permissions a non-SUPER_ADMIN actor may delegate to a user they're
 * otherwise authorized to manage, PROVIDED they possess the permission
 * themselves (AuthorizationService.canGrantPermission still checks that).
 * Meta/system permissions (users.*, roles.*, permissions.*, settings.*,
 * audit.view) never appear here — only SUPER_ADMIN can hand those out,
 * regardless of who currently holds them.
 */
export const DELEGABLE_PERMISSIONS: Set<Permission> = new Set(
  OPERATIONAL.filter((p) => p !== 'dashboard.view' && p !== 'users.view'),
);
