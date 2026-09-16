# Geography

This document describes where the platform's organizational-hierarchy
data actually comes from, what has been imported, and how it is kept
consistent. It draws on `apps/api/prisma/data/inec/SOURCE.md`,
`apps/api/prisma/seed.ts`, `apps/api/prisma/scripts/import-inec-gombe.ts`,
and `apps/api/prisma/scripts/validate-org-hierarchy.ts`, plus a live count
against the running database.

## Hierarchy

```
State → SenatorialDistrict → LGA → Ward → PollingUnit
```

One state only: **Gombe**. This is a single-state platform — nothing in
the schema or code prevents adding a second `State` row, but no code path
does so today, and the seed data assumes exactly one state named "Gombe."

## What's seeded vs. what's imported

Two distinct data-entry paths feed this hierarchy, and they are not the
same kind of data:

### Seeded (hand-entered, `prisma/seed.ts`)

The **State + 3 SenatorialDistricts + 11 LGAs** are created directly by
`seedOrganization()`, from a hardcoded map:

```typescript
const DISTRICTS: Record<string, string[]> = {
  'Gombe Central': ['Akko', 'Yamaltu/Deba'],
  'Gombe North': ['Dukku', 'Funakaye', 'Gombe', 'Kwami', 'Nafada'],
  'Gombe South': ['Balanga', 'Billiri', 'Kaltungo', 'Shongom'],
};
```

Idempotent upserts — safe to re-run. This level of the hierarchy is small
and stable enough (Nigeria's senatorial districts and LGAs are fixed
administrative boundaries) that it's reasonable to hand-enter rather than
scrape, and it was.

### Imported (real INEC data, `prisma/scripts/import-inec-gombe.ts`)

**Wards and polling units are never hand-entered or fabricated.** They
come from a real scrape of INEC's own public polling-units API, fully
documented in `prisma/data/inec/SOURCE.md`:

> Scraped directly from INEC's own public polling-units API
> (`https://www.inecnigeria.org/polling-units/`) by
> JayCodist/inec-polling-units-scraper, `results/gombe.json`, commit as of
> 2025-09-27. Scrape timestamp: 2025-09-27T11:47:40.679Z.

**Provenance cross-check performed at import time**: the scrape's
national totals were checked against INEC's own published figures
(`@inecnigeria`, Feb 2023) — 774 LGAs and 8,809 wards match *exactly*;
national polling units are close (185,432 scraped vs. 176,846 tweeted,
explained by register turnover between the tweet date and the scrape
date).

**Known data artifacts, both handled explicitly by the import script**:
- Every one of Gombe's 114 wards' `pollingUnits` arrays in the source JSON ends with one trailing empty `{}` object (confirmed present in all 114) — filtered out during import, not left as garbage rows.
- The source spells one ward name `"YALMALTU/ DEBA"`; the database uses the correct `"Yamaltu/Deba"` — the import script maps this one known spelling variant explicitly rather than importing the typo.

**Each polling unit's `code`** field is the real INEC delimitation code
(state/lga/ward/unit, e.g. `15/01/01/001`), preserved verbatim from the
source — this is the field the schema's `PollingUnit.@@unique([code])`
constraint relies on for true uniqueness (see `DATABASE.md` for why
`[wardId, name]` is *not* unique).

**No coordinate data**: `PollingUnit.latitude`/`longitude` exist in the
schema but are populated by nothing — the INEC source has zero coordinate
data for any record. They stay `null`, not estimated.

## Counts

After filtering (per `SOURCE.md`), the import produces, for Gombe State:

| Level | Count |
|---|---|
| States | 1 |
| Senatorial Districts | 3 |
| LGAs | 11 |
| Wards | 114 |
| Polling Units | 2,984 |

The task's original expectation was ~2,988 polling units; the 4-unit
difference is documented in `SOURCE.md` as plausible INEC register
turnover between the historical reference figure and the 2025-09-27
scrape — not treated as an error, and not silently corrected by fabricating
4 additional records.

**Verified live against the running database** at the time of writing:
1 State, 3 Districts, 11 LGAs, 114 Wards, 2,984 Polling Units — matching
the documented import output exactly.

## Validation

`prisma/scripts/validate-org-hierarchy.ts` (run via
`npm run validate:org-hierarchy` / `npx ts-node prisma/scripts/validate-org-hierarchy.ts`)
checks, after any import or seed run:

1. **Exact expected counts** — 1 State, 3 Districts, 11 LGAs, 114 Wards (hardcoded expectations; a mismatch is reported as a problem).
2. **No orphans** — no LGA without a district, no ward without an LGA, no district without wards (via `_count` queries against each parent).
3. **No duplicate codes** — raw SQL `GROUP BY code HAVING count(*) > 1` across LGA, Ward, and PollingUnit.
4. **Polling-unit count sanity check** — compares the live count against `HISTORICAL_DOCUMENTED_PU_COUNT = 2988` and *reports* the delta; it does not fail the run or attempt to reconcile the difference by inventing/deleting records.

This script does not run automatically (no CI, per `ARCHITECTURE.md`) —
it is a manual verification step run after importing or reseeding data.

## Geographic scope in the rest of the app

Every administrative `User`, every `CampaignMembership`, `Member`,
`Event`, `ResourceAllocation`, and every campaign geo-scoped model
(`CampaignTeam`, `CampaignVolunteer`, `CampaignEvent`, `CampaignTask`,
`CampaignActivity`) references this same hierarchy via the same four FK
columns (`senatorialDistrictId`/`lgaId`/`wardId`/`pollingUnitId`) — there
is one geography, referenced consistently, not a per-module copy. See
`AUTHORIZATION.md` for how scope containment is actually enforced against
these tables.
