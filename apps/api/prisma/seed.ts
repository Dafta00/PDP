import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Verified via public search (see build notes): Gombe Central Senatorial
// District comprises Akko LGA and Yamaltu/Deba LGA. Wards and polling units
// are NOT seeded here — they must come from the official INEC register and
// should be entered by administrators through the Organization module.
async function seedOrganization() {
  const state = await prisma.state.upsert({
    where: { name: 'Gombe' },
    create: { name: 'Gombe' },
    update: {},
  });

  const district = await prisma.senatorialDistrict.upsert({
    where: { stateId_name: { stateId: state.id, name: 'Gombe Central' } },
    create: { name: 'Gombe Central', stateId: state.id },
    update: {},
  });

  for (const lgaName of ['Akko', 'Yamaltu/Deba']) {
    await prisma.lGA.upsert({
      where: { senatorialDistrictId_name: { senatorialDistrictId: district.id, name: lgaName } },
      create: { name: lgaName, senatorialDistrictId: district.id },
      update: {},
    });
  }

  return { state, district };
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

async function main() {
  await seedOrganization();
  await seedSuperAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
