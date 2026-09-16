import { CampaignRole } from '@prisma/client';

/**
 * The campaign permission catalog — namespaced `campaign.*`, in the same
 * "permission string" style as the administrative catalog
 * (common/authorization/permissions.ts), but resolved against CampaignRole
 * (a distinct enum) via its own tables. See CampaignAuthorizationService.
 */
export const CAMPAIGN_PERMISSIONS = [
  'campaign.dashboard.view',

  'campaign.users.view',
  'campaign.users.create',
  'campaign.users.update',
  'campaign.users.deactivate',

  'campaign.events.view',
  'campaign.events.create',
  'campaign.events.update',
  'campaign.events.delete',

  'campaign.attendance.view',
  'campaign.attendance.manage',

  'campaign.teams.view',
  'campaign.teams.create',
  'campaign.teams.update',
  'campaign.teams.manage',

  'campaign.volunteers.view',
  'campaign.volunteers.create',
  'campaign.volunteers.update',

  'campaign.tasks.view',
  'campaign.tasks.create',
  'campaign.tasks.assign',
  'campaign.tasks.update',
  'campaign.tasks.complete',

  'campaign.resources.view',
  'campaign.resources.request',
  'campaign.resources.allocate',

  'campaign.activity.view',
  'campaign.activity.create',

  'campaign.reports.view',
  'campaign.reports.generate',
  'campaign.reports.export',
] as const;

export type CampaignPermission = (typeof CAMPAIGN_PERMISSIONS)[number];

export function isCampaignPermission(value: string): value is CampaignPermission {
  return (CAMPAIGN_PERMISSIONS as readonly string[]).includes(value);
}

const ALL: CampaignPermission[] = [...CAMPAIGN_PERMISSIONS];

const GEOGRAPHIC_COORDINATOR_BASE: CampaignPermission[] = [
  'campaign.dashboard.view',
  'campaign.users.view',
  'campaign.users.create',
  'campaign.users.update',
  'campaign.users.deactivate',
  'campaign.events.view',
  'campaign.events.create',
  'campaign.events.update',
  'campaign.events.delete',
  'campaign.attendance.view',
  'campaign.attendance.manage',
  'campaign.teams.view',
  'campaign.teams.create',
  'campaign.teams.update',
  'campaign.teams.manage',
  'campaign.volunteers.view',
  'campaign.volunteers.create',
  'campaign.volunteers.update',
  'campaign.tasks.view',
  'campaign.tasks.create',
  'campaign.tasks.assign',
  'campaign.tasks.update',
  'campaign.tasks.complete',
  'campaign.resources.view',
  'campaign.resources.request',
  'campaign.resources.allocate',
  'campaign.activity.view',
  'campaign.activity.create',
  'campaign.reports.view',
  'campaign.reports.generate',
  'campaign.reports.export',
];

/**
 * Seed defaults for CampaignRolePermission, mirroring
 * common/authorization/permissions.ts's DEFAULT_ROLE_PERMISSIONS. Used as a
 * fallback when the DB table is empty for a role, and by prisma/seed.ts.
 * The six geographic-coordinator roles get the full operational set — what
 * actually limits them is role rank + geographic scope (see
 * CampaignAuthorizationService), not narrower permissions. The five
 * functional specialist roles get only what their name implies.
 */
export const DEFAULT_CAMPAIGN_ROLE_PERMISSIONS: Record<CampaignRole, CampaignPermission[]> = {
  [CampaignRole.CAMPAIGN_SUPER_ADMIN]: ALL,
  [CampaignRole.STATE_CAMPAIGN_COORDINATOR]: GEOGRAPHIC_COORDINATOR_BASE,
  [CampaignRole.DISTRICT_COORDINATOR]: GEOGRAPHIC_COORDINATOR_BASE,
  [CampaignRole.LGA_COORDINATOR]: GEOGRAPHIC_COORDINATOR_BASE,
  [CampaignRole.WARD_COORDINATOR]: GEOGRAPHIC_COORDINATOR_BASE,
  [CampaignRole.POLLING_UNIT_COORDINATOR]: [
    'campaign.dashboard.view',
    'campaign.users.view',
    'campaign.users.create',
    'campaign.users.update',
    'campaign.events.view',
    'campaign.attendance.view',
    'campaign.attendance.manage',
    'campaign.teams.view',
    'campaign.volunteers.view',
    'campaign.volunteers.create',
    'campaign.volunteers.update',
    'campaign.tasks.view',
    'campaign.tasks.update',
    'campaign.tasks.complete',
    'campaign.resources.view',
    'campaign.resources.request',
    'campaign.activity.view',
    'campaign.activity.create',
    'campaign.reports.view',
  ],
  [CampaignRole.CAMPAIGN_DATA_OFFICER]: [
    'campaign.dashboard.view',
    'campaign.events.view',
    'campaign.attendance.view',
    'campaign.attendance.manage',
    'campaign.volunteers.view',
    'campaign.volunteers.create',
    'campaign.volunteers.update',
    'campaign.activity.view',
    'campaign.reports.view',
    'campaign.reports.generate',
    'campaign.reports.export',
  ],
  [CampaignRole.EVENT_COORDINATOR]: [
    'campaign.dashboard.view',
    'campaign.events.view',
    'campaign.events.create',
    'campaign.events.update',
    'campaign.attendance.view',
    'campaign.attendance.manage',
    'campaign.tasks.view',
    'campaign.tasks.create',
    'campaign.tasks.update',
    'campaign.activity.view',
    'campaign.activity.create',
    'campaign.reports.view',
  ],
  [CampaignRole.LOGISTICS_OFFICER]: [
    'campaign.dashboard.view',
    'campaign.resources.view',
    'campaign.resources.request',
    'campaign.resources.allocate',
    'campaign.tasks.view',
    'campaign.tasks.update',
    'campaign.activity.view',
    'campaign.activity.create',
    'campaign.reports.view',
  ],
  [CampaignRole.VOLUNTEER_COORDINATOR]: [
    'campaign.dashboard.view',
    'campaign.volunteers.view',
    'campaign.volunteers.create',
    'campaign.volunteers.update',
    'campaign.teams.view',
    'campaign.teams.create',
    'campaign.attendance.view',
    'campaign.activity.view',
    'campaign.activity.create',
    'campaign.reports.view',
  ],
  [CampaignRole.REPORT_VIEWER]: ['campaign.dashboard.view', 'campaign.reports.view'],
};
