/**
 * Imports the official Gombe State ward and polling-unit register into the
 * database. Source data and provenance: prisma/data/inec/SOURCE.md — a
 * direct scrape of INEC's own public polling-units portal, not invented.
 *
 * Idempotent: re-running only adds missing records (upsert by the unique
 * constraints already on LGA/Ward/PollingUnit) and never touches existing
 * LGAs, wards, polling units, or the members/users attached to them.
 *
 * Usage: npx ts-node prisma/scripts/import-inec-gombe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RawPollingUnit {
  id?: string;
  name?: string;
  delimitation?: string;
  remark?: string;
}

interface RawWard {
  id: string;
  name: string;
  abbreviation: string;
  pollingUnits: RawPollingUnit[];
}

interface RawLga {
  id: string;
  name: string;
  abbreviation: string;
  wards: RawWard[];
}

interface RawGombeFile {
  state: { code: string; name: string; lgas: RawLga[] };
  metadata: { scrapedAt: string; totalLGAs: number; totalWards: number; totalPollingUnits: number };
}

// The scrape spells this LGA differently from the name already seeded in the
// database (from an earlier, separately-verified source). This is the only
// name reconciliation this script performs — everything else must match
// the existing LGA name exactly (case-insensitively) or the import fails
// loudly rather than silently creating a duplicate LGA.
const LGA_NAME_ALIASES: Record<string, string> = {
  'YALMALTU/ DEBA': 'Yamaltu/Deba',
};

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s/(-])([a-z])/g, (_match, sep: string, ch: string) => sep + ch.toUpperCase());
}

function resolveLgaName(scrapedName: string): string {
  return LGA_NAME_ALIASES[scrapedName] ?? titleCase(scrapedName);
}

const SOURCE_LABEL = 'INEC polling-units portal (via JayCodist/inec-polling-units-scraper)';

async function main() {
  const filePath = path.join(__dirname, '..', 'data', 'inec', 'gombe.json');
  const raw: RawGombeFile = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  console.log(`Source scrape timestamp: ${raw.metadata.scrapedAt}`);
  console.log(
    `Source file claims: ${raw.metadata.totalLGAs} LGAs, ${raw.metadata.totalWards} wards, ${raw.metadata.totalPollingUnits} polling units (includes one known trailing-artifact record per ward — filtered below).`,
  );

  const state = await prisma.state.findUniqueOrThrow({ where: { name: 'Gombe' } });
  await prisma.state.update({ where: { id: state.id }, data: { code: raw.state.code } });

  const effectiveFrom = new Date(raw.metadata.scrapedAt);

  let wardsCreated = 0;
  let wardsExisting = 0;
  let pusCreated = 0;
  let pusExisting = 0;
  let artifactsSkipped = 0;
  const errors: string[] = [];

  for (const rawLga of raw.state.lgas) {
    const resolvedName = resolveLgaName(rawLga.name);
    const lga = await prisma.lGA.findFirst({
      where: { name: { equals: resolvedName, mode: 'insensitive' } },
    });
    if (!lga) {
      errors.push(
        `No existing LGA matches scraped "${rawLga.name}" (resolved to "${resolvedName}"). Skipped its ${rawLga.wards.length} wards — create the LGA first.`,
      );
      continue;
    }

    const lgaCode = `${raw.state.code}/${rawLga.abbreviation}`;
    await prisma.lGA.update({ where: { id: lga.id }, data: { code: lgaCode } });

    for (const rawWard of rawLga.wards) {
      const wardName = titleCase(rawWard.name);
      const wardCode = `${lgaCode}/${rawWard.abbreviation}`;

      const existingWard = await prisma.ward.findFirst({
        where: { lgaId: lga.id, name: { equals: wardName, mode: 'insensitive' } },
      });

      const ward = existingWard
        ? await prisma.ward.update({ where: { id: existingWard.id }, data: { code: wardCode } })
        : await prisma.ward.create({ data: { name: wardName, code: wardCode, lgaId: lga.id } });

      if (existingWard) wardsExisting++;
      else wardsCreated++;

      for (const rawPu of rawWard.pollingUnits) {
        if (!rawPu.id || !rawPu.name || !rawPu.delimitation) {
          artifactsSkipped++;
          continue;
        }

        const puName = titleCase(rawPu.name);
        // Keyed by the official INEC code, not name — INEC's own register
        // legitimately has multiple distinct polling units sharing an
        // identical name within one ward (e.g. two "POLICE BARRACK" units,
        // same building, different unit numbers), confirmed present 18
        // times in this dataset. Matching by name would silently collapse
        // those into one row.
        const existingPu = await prisma.pollingUnit.findUnique({
          where: { code: rawPu.delimitation },
        });

        if (existingPu) {
          await prisma.pollingUnit.update({
            where: { id: existingPu.id },
            data: {
              name: puName,
              wardId: ward.id,
              source: SOURCE_LABEL,
              sourceVersion: raw.metadata.scrapedAt,
              effectiveFrom,
            },
          });
          pusExisting++;
        } else {
          await prisma.pollingUnit.create({
            data: {
              name: puName,
              code: rawPu.delimitation,
              wardId: ward.id,
              source: SOURCE_LABEL,
              sourceVersion: raw.metadata.scrapedAt,
              effectiveFrom,
            },
          });
          pusCreated++;
        }
      }
    }
    console.log(`  ${resolvedName}: ${rawLga.wards.length} wards processed`);
  }

  console.log('\n--- Import summary ---');
  console.log(`Wards created: ${wardsCreated}, already existed: ${wardsExisting}`);
  console.log(`Polling units created: ${pusCreated}, already existed: ${pusExisting}`);
  console.log(`Trailing artifact records skipped (no id/name/delimitation): ${artifactsSkipped}`);
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
