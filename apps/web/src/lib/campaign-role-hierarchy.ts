import { CampaignRole } from './campaign-types';

/** Mirrors the backend's CampaignAuthorizationService ordering — UX convenience only, the API independently re-validates. */
const GEOGRAPHIC_HIERARCHY: CampaignRole[] = [
  'CAMPAIGN_SUPER_ADMIN',
  'STATE_CAMPAIGN_COORDINATOR',
  'DISTRICT_COORDINATOR',
  'LGA_COORDINATOR',
  'WARD_COORDINATOR',
  'POLLING_UNIT_COORDINATOR',
];

const FUNCTIONAL_ROLES: CampaignRole[] = [
  'CAMPAIGN_DATA_OFFICER',
  'EVENT_COORDINATOR',
  'LOGISTICS_OFFICER',
  'VOLUNTEER_COORDINATOR',
  'REPORT_VIEWER',
];

export const CAMPAIGN_ROLES: CampaignRole[] = [...GEOGRAPHIC_HIERARCHY, ...FUNCTIONAL_ROLES];

function rankOf(role: CampaignRole): number {
  return GEOGRAPHIC_HIERARCHY.indexOf(role);
}

export function assignableCampaignRoles(actorRole: CampaignRole): CampaignRole[] {
  if (actorRole === 'CAMPAIGN_SUPER_ADMIN') return CAMPAIGN_ROLES;
  if (FUNCTIONAL_ROLES.includes(actorRole)) return [];
  const actorRank = rankOf(actorRole);
  return [...GEOGRAPHIC_HIERARCHY.filter((r) => rankOf(r) > actorRank), ...FUNCTIONAL_ROLES];
}

export type CampaignScopeField = 'senatorialDistrictId' | 'lgaId' | 'wardId' | 'pollingUnitId';

export const CAMPAIGN_SCOPE_FIELD: Partial<Record<CampaignRole, CampaignScopeField>> = {
  DISTRICT_COORDINATOR: 'senatorialDistrictId',
  LGA_COORDINATOR: 'lgaId',
  WARD_COORDINATOR: 'wardId',
  POLLING_UNIT_COORDINATOR: 'pollingUnitId',
};

/** Geography-nesting depth for a fixed-scope coordinator role — 0 (broadest) to 3 (narrowest); -1 for unrestricted/functional. */
export function campaignScopeLevelRank(role: CampaignRole): number {
  switch (role) {
    case 'DISTRICT_COORDINATOR':
      return 0;
    case 'LGA_COORDINATOR':
      return 1;
    case 'WARD_COORDINATOR':
      return 2;
    case 'POLLING_UNIT_COORDINATOR':
      return 3;
    default:
      return -1;
  }
}

export function humanCampaignRole(role: CampaignRole): string {
  return role.replaceAll('_', ' ');
}
