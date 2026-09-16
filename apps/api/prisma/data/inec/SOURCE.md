# Source: Gombe State ward & polling unit register

**File:** `gombe.json`

**Origin:** Scraped directly from INEC's own public polling-units API
(`https://www.inecnigeria.org/polling-units/`) by the open-source tool
[`JayCodist/inec-polling-units-scraper`](https://github.com/JayCodist/inec-polling-units-scraper)
(`results/gombe.json`, commit as of 2025-09-27).

**Scrape timestamp:** 2025-09-27T11:47:40.679Z (per the file's own `metadata` block).

**Why this source:** It is not INEC's own downloadable dataset (INEC does not publish
one directly), but it is a direct, unmodified scrape of INEC's own live polling-unit
lookup portal — not a manually-compiled or invented list. Cross-checked against INEC's
own published national figures (@inecnigeria, Feb 2023): the scraper's national totals
(774 LGAs, 8,809 wards) match exactly; national polling units are close (185,432 scraped
vs. 176,846 tweeted) with the gap explained below.

**Known artifact:** every ward's `pollingUnits` array ends with one trailing empty `{}`
object (confirmed present in all 114 Gombe wards, and consistent with the ~8,809-unit gap
in the national polling-unit total). The import script filters these out — they are not
real polling units, just an off-by-one artifact in whatever pagination the scraper hit.

**Counts after filtering the artifact, for Gombe State:**
- 11 LGAs (matches expected)
- 114 wards (matches expected exactly)
- 2,984 polling units (task expected ~2,988 — a difference of 4, most plausibly minor
  INEC register updates between whenever the "2,988" figure was sourced and this
  2025-09-27 scrape; not forced to match)

**Ward-name note:** the scrape spells one LGA "YALMALTU/ DEBA"; the database's
existing LGA (seeded earlier from a different verified source) uses "Yamaltu/Deba".
The import script maps this one known spelling variant explicitly — it does not
fuzzy-match any other names.

**Source comparison performed:** before relying on this dataset, a search was made
for a competing or more current authoritative source. Found: (1) an official INEC
PDF (`PU_Directory_Revised_January_2015_Gombe.pdf`) — dead link (404), predates the
2022 national delimitation exercise regardless; (2) a secondary aggregator figure
("3,063 polling units... in all 11 Wards") repeated across a couple of unofficial
sites (eduweb.com.ng, manpower.com.ng, both blocked further access with a 403) —
its own wording conflates a specific LGA's ward count with the state's, and it does
not match any single LGA's actual PU count in this dataset either (closest is
Gombe LGA proper at 408), so it reads as an inconsistent or miscontextualized
secondary summary rather than a distinct authoritative figure worth preferring.
No more-current or more-directly-sourced machine-readable dataset was found. This
scrape — pulled directly from INEC's own live portal API in September 2025, and
cross-validated against INEC's own tweeted national totals (774 LGAs, 8,809 wards
match exactly) — remains the best available source.

Each polling unit's official INEC delimitation code (`state/lga/ward/unit`, e.g.
`15/01/01/001`) is preserved verbatim as its `code`.
