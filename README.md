# PDP Gombe Central Management Platform

Membership & administrative management platform for the PDP Gombe Central
Senatorial District. Membership is the flagship module; the architecture is
built to add further administrative modules (events/attendance, resources,
distribution, documents, reporting) without reshaping the foundation.

## Stack

- **API**: NestJS + TypeScript + Prisma, PostgreSQL
- **Web**: Next.js (App Router) + TypeScript + Tailwind CSS
- **Auth**: JWT access/refresh tokens, RBAC enforced server-side

## Status (current build)

Implemented end-to-end (DB → API → UI → tests):

- Auth (login/refresh/logout), RBAC across 7 roles, org-scoped authorization
- Organizational hierarchy: State → Senatorial District → LGA → Ward → Polling Unit
- Membership: registration, search/filter/pagination, profile, status changes,
  unique sequential membership IDs (`PDP-GC-2026-000001`)
- QR issuance/revocation as a reusable service (not distribution-specific)
- Universal member verification (QR / membership ID / phone search) — mobile-first
- Digital membership card (view + print)
- Audit logging (immutable, viewable by top-level admins)
- Users & Roles administration
- Dashboard with real counts (no fabricated data)
- Events: create/manage with a denormalized target hierarchy (district-wide
  down to a single polling unit), status lifecycle (DRAFT → UPCOMING →
  ACTIVE → COMPLETED/CANCELLED), org-scoped visibility and creation rights
  (e.g. a ward admin can only target their own ward or its polling units,
  and a broader admin's LGA-wide event is still visible to their ward
  officers)
- Attendance: mobile-first QR/membership-ID check-in reusing the same
  verification service as membership, with a **database-level unique
  constraint** (`eventId` + `memberId`) preventing duplicate check-ins even
  under concurrent requests — not just an application-level check
- Resources: inventory catalog (e.g. "Rice", 2,000 bags), org-scoped
  allocations down to LGA/Ward/Polling-Unit level, and usage/adjustment
  transactions against each allocation. Both the resource pool and each
  allocation's remaining quantity are decremented via an **atomic
  conditional `UPDATE ... WHERE remaining >= quantity`** (the same
  race-safe pattern as membership IDs and attendance) rather than a
  read-then-write check, so concurrent over-allocation/over-use is
  impossible even under load — verified live (allocating exactly the
  remaining stock succeeds, the next unit over is rejected with a clear
  message, not a stack trace)

- Distribution: member-facing campaigns (e.g. "Ramadan Food Support") built
  directly on top of `ResourceAllocation` (a nullable `distributionId` links
  an allocation to a campaign, sharing the exact same atomic quantity
  tracking as generic resource management) and the existing
  `VerificationService` for identifying members — the same reuse pattern
  Attendance used on top of Events. A field officer's own assigned unit
  auto-resolves which allocation to draw from (no need to know an internal
  allocation ID); receipt confirmation is blocked by a **database unique
  constraint** on (distribution, member); and reversing a receipt (e.g. to
  correct a mistake) restores the allocation's quantity and reactivates the
  same row rather than creating a duplicate, so the unique constraint holds
  even across reversal/re-issue. Building this surfaced and fixed a real bug:
  Postgres aborts an entire transaction on the first failing statement, so a
  "try insert, catch the unique-constraint violation, then run a recovery
  query in the same transaction" pattern doesn't work — the recovery query
  itself fails with "current transaction is aborted." Fixed by checking for
  an existing receipt with a plain `SELECT` *before* writing anything, with a
  defense-in-depth translation of the rare residual race (two simultaneous
  confirmations for the same member) into the same friendly conflict error.

- Documents: organizational file management (reports, meeting minutes,
  policies, forms, etc.) with a per-document `restrictedToAdmins` flag.
  Restricted documents are hidden from listings for non-top-level-admin
  roles and return **404 (not 403)** on direct fetch/download — a 403 would
  itself confirm the document exists, which is exactly the kind of leak
  "don't expose restricted documents to unauthorized users" is guarding
  against. Files are stored **outside** the public `/uploads` static
  directory used for member photos and served only through an authenticated
  download endpoint, so a restricted file's path can never be guessed and
  fetched directly. Every download of a restricted document is audit-logged
  (public documents aren't, to keep the audit log meaningful rather than
  noisy). Building this also caught a real bug: a multipart boolean field
  (`restrictedToAdmins=false`) was being parsed as `true` by class-validator's
  implicit type conversion (any non-empty string, including the literal text
  "false", is truthy) — fixed by validating it as a literal `'true'|'false'`
  string and parsing it explicitly rather than trusting automatic conversion.

- Reports: a dedicated `/reports` area (Membership, Activities, Resources,
  Distributions tabs), all org-scoped consistently with every other module —
  stat cards, LGA/ward breakdowns, a 12-month registration trend, top events
  by attendance, resource inventory + allocation-by-LGA, and per-distribution
  allocated/distributed/remaining/recipients with a recipients-by-LGA
  breakdown. Every breakdown table has a client-side CSV export. Building
  this surfaced and fixed two real cross-scope bugs (see below) rather than
  just adding a new screen on top of already-correct data.

**Bugs found and fixed while building Reports** (both are the same failure
shape: a per-unit breakdown loop spreading `{ ...scopeWhere, someId: x }`,
where `someId` happens to be the *same field* the actor's own scope already
constrains — the loop's value silently overwrites the actor's restriction
instead of narrowing it):
- The Reports membership-by-ward/by-LGA breakdown was doing exactly this,
  so a Ward Admin's own-ward row was actually being computed with the
  *loop's* ward filter, not their own — for their own ward specifically the
  numbers happened to look plausible, but every other ward in the list also
  ran with the actor's constraint silently dropped. Fixed by resolving which
  units the actor is even allowed to see *first* (`OrgScopeService.
  resolveVisibleUnits`, an ancestor lookup analogous to `eventScopeWhere`),
  then only enumerating those — which also makes the later spread safe by
  construction. Covered by a regression test that fails loudly if this
  regresses.
- Separately (found by inspection while auditing for the same pattern, not
  by a test): the **Dashboard's** registration-trend chart used a raw SQL
  query that never applied the viewer's org scope at all — a Ward Admin's
  dashboard was silently showing the district-wide monthly trend, not their
  own ward's. Fixed with a small helper (`memberScopeToSql`) that safely
  translates the scope object into a parameterized `WHERE` fragment (bound
  as query parameters, not string-concatenated — no injection risk), shared
  between the Dashboard and the new Membership report.

The schema and shared services (verification, QR, audit, org-scope) have now
been extended additively through every module in the original build plan —
Membership, Organization, Events/Attendance, Resources, Distribution,
Documents, and Reports.

## Verified organizational data

Gombe Central Senatorial District = **Akko LGA** + **Yamaltu/Deba LGA**
(confirmed via public search; see `apps/api/prisma/seed.ts`). Wards and
polling units are **not** seeded — enter them from the official INEC
register via the Organization screen.

## Running locally

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Configure environment (defaults already point at the docker-compose db)
cp .env.example apps/api/.env

# 4. Run migrations + seed (creates the two verified LGAs + a super admin)
pnpm --filter api prisma:migrate
pnpm --filter api prisma:seed

# 5. Run both apps
pnpm dev:api     # http://localhost:4055
pnpm dev:web     # http://localhost:3055
```

Seeded super admin: value of `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`
in `.env` (defaults: `admin@pdpgombecentral.org` / `ChangeMe123!`). **Change
this password after first login.**

Ports 5432/3000/4000 are commonly taken on shared dev machines, so this
project defaults to 5439 (Postgres), 4055 (API), 3055 (web) — adjust in
`.env` / `docker-compose.yml` if those also collide.

## Tests

```bash
pnpm --filter api test
```

66 unit tests cover auth (invalid/disabled-account rejection, token issuance),
membership ID uniqueness/sequencing, QR issue/resolve/revoke, RBAC org-scope
logic (including event-target and reports ancestor resolution), event-target
authorization (who can create a district/LGA/ward/polling-unit-level event),
attendance duplicate-checkin prevention, resource allocation/usage
atomic-quantity guards (exact-remaining success + over-allocation/over-use
rejection), distribution receipt confirm/duplicate/reversal/reactivation
logic (including a rollback-simulating test fake, since a naive fake would
have hidden the real Postgres transaction-abort bug described above),
document visibility (restricted documents hidden from listings/404 on direct
access for non-admins, audit-logged downloads) plus management permission
(uploader or admin only), the safe SQL-scoping helper, and the reports
breakdown scoping fix (a Ward Admin never sees another unit's count leak
into their own row).

## Known simplifications (documented, not hidden)

- File storage (member photos under `apps/api/uploads/`, documents under
  `apps/api/document-storage/`) is local disk — swap for S3/blob storage
  before production. Documents are deliberately kept in a separate,
  non-statically-served directory (see the Documents section above).
- The web app stores the refresh token in `localStorage`; a production
  hardening pass should move to an httpOnly cookie.
- QR camera scanning uses the browser's native `BarcodeDetector` API where
  supported (modern Chrome/Android) with a manual-entry fallback — no
  external scanning library was added.
