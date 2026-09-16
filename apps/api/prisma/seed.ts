import { CampaignRole, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/common/authorization/permissions';
import { DEFAULT_CAMPAIGN_ROLE_PERMISSIONS } from '../src/campaign/authorization/campaign-permissions';

const prisma = new PrismaClient();

// Official Gombe State senatorial districts and their constituent LGAs.
// Wards and polling units are deliberately NOT seeded here — the state has
// 114 wards and ~2,988 polling units, and inventing plausible-looking
// records would put fabricated data into the register of a real party's
// membership platform. They must come from the official INEC register and
// be entered (or bulk-imported) by administrators through the Organization
// module. Upserts here are idempotent and additive, so re-running this seed
// never touches previously-entered Gombe Central wards/polling units/members.
const DISTRICTS: Record<string, string[]> = {
  'Gombe Central': ['Akko', 'Yamaltu/Deba'],
  'Gombe North': ['Dukku', 'Funakaye', 'Gombe', 'Kwami', 'Nafada'],
  'Gombe South': ['Balanga', 'Billiri', 'Kaltungo', 'Shongom'],
};

async function seedOrganization() {
  const state = await prisma.state.upsert({
    where: { name: 'Gombe' },
    create: { name: 'Gombe' },
    update: {},
  });

  for (const [districtName, lgaNames] of Object.entries(DISTRICTS)) {
    const district = await prisma.senatorialDistrict.upsert({
      where: { stateId_name: { stateId: state.id, name: districtName } },
      create: { name: districtName, stateId: state.id },
      update: {},
    });

    for (const lgaName of lgaNames) {
      await prisma.lGA.upsert({
        where: { senatorialDistrictId_name: { senatorialDistrictId: district.id, name: lgaName } },
        create: { name: lgaName, senatorialDistrictId: district.id },
        update: {},
      });
    }
  }

  return { state };
}

async function seedSuperAdmin() {
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@pdpgombecentral.org').toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: 'System Administrator',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log(`Created super admin: ${email} (change the seeded password after first login)`);
}

// Populates RolePermission from the code defaults — idempotent (skipUnknown
// on unique conflict) and additive only. Once seeded, a SUPER_ADMIN can
// adjust individual rows via the API without ever touching this script;
// re-running it never overwrites a row that already exists, so it's safe to
// run again after such an edit.
async function seedRolePermissions() {
  for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]) {
    for (const permission of DEFAULT_ROLE_PERMISSIONS[role]) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        create: { role, permission },
        update: {},
      });
    }
  }
  console.log('Seeded default role permissions.');
}

async function seedCampaignRolePermissions() {
  for (const role of Object.keys(DEFAULT_CAMPAIGN_ROLE_PERMISSIONS) as CampaignRole[]) {
    for (const permission of DEFAULT_CAMPAIGN_ROLE_PERMISSIONS[role]) {
      await prisma.campaignRolePermission.upsert({
        where: { role_permission: { role, permission } },
        create: { role, permission },
        update: {},
      });
    }
  }
  console.log('Seeded default campaign role permissions.');
}

// The initial PDP Gombe State 2027 governorship campaign. Candidate details
// live here — in the database — rather than hardcoded in the frontend, per
// spec section 3/23; editing them later is a PATCH /campaigns/:id away
// (administrative SUPER_ADMIN/STATE_ADMIN only), not a code change.
async function seedCampaign(stateId: string) {
  const existing = await prisma.campaign.findFirst({
    where: { candidateName: 'Isa Ali Ibrahim Pantami', electionYear: 2027 },
  });
  if (existing) {
    console.log('Campaign already exists: PDP Gombe State 2027 Governorship Campaign');
    return existing;
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: 'PDP Gombe State 2027 Governorship Campaign',
      candidateName: 'Isa Ali Ibrahim Pantami',
      candidateTitle: 'Professor',
      party: 'PDP',
      electionType: 'GOVERNORSHIP',
      electionYear: 2027,
      status: 'PLANNED',
      stateId,
    },
  });
  console.log(`Created campaign: ${campaign.name}`);
  return campaign;
}

/**
 * Gives the seeded administrative SUPER_ADMIN an initial campaign
 * membership (CAMPAIGN_SUPER_ADMIN) so there's at least one usable account
 * to configure the campaign module with post-install — an explicit,
 * one-time seeded assignment, not an automatic administrative-role-to-
 * campaign-role rule (see CampaignAuthorizationService header note; the two
 * domains stay independent for every other account).
 */
async function seedCampaignSuperAdmin(campaignId: string) {
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@pdpgombecentral.org').toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const existing = await prisma.campaignMembership.findUnique({
    where: { campaignId_userId: { campaignId, userId: user.id } },
  });
  if (existing) {
    console.log(`Campaign membership already exists for: ${email}`);
    return;
  }

  await prisma.campaignMembership.create({
    data: { campaignId, userId: user.id, role: CampaignRole.CAMPAIGN_SUPER_ADMIN },
  });
  console.log(`Granted CAMPAIGN_SUPER_ADMIN on the seeded campaign to: ${email}`);
}

async function main() {
  const { state } = await seedOrganization();
  await seedSuperAdmin();
  await seedRolePermissions();
  await seedCampaignRolePermissions();
  const campaign = await seedCampaign(state.id);
  await seedCampaignSuperAdmin(campaign.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
