# Database

Single PostgreSQL 16 database, one schema, managed entirely through Prisma
5 (`apps/api/prisma/schema.prisma`). This document was written by reading
that file in full plus all 13 migrations (`apps/api/prisma/migrations/`) —
every model, field, relation, index, and constraint below exists as
written; nothing here is aspirational.

Migrations, in order: `init` → `events_attendance` → `resources` →
`distribution` → `documents` → `add_senatorial_admin_scope` →
`add_org_unit_code_and_status` → `drop_polling_unit_ward_name_unique` →
`add_polling_unit_provenance_and_indexes` → `add_user_can_create_users` →
`add_permissions_and_multi_scope` → `add_campaign_operations` →
`add_member_education_nin_pvc_and_messaging`. All are additive/corrective
(new tables, new nullable columns, new indexes, one constraint removal to
accommodate a real-world data shape — see "Notable schema decisions"
below); none rewrites existing data. The final migration adds
`Member.educationLevel`/`educationLevelOther`/`ninEncrypted`/`ninHash`/`pvcNumber`
(all nullable) and the `Message`/`MessageAttachment` models — see §3 and §8b.

**36 models** across 9 sections, described below in schema order.

## 1. Auth / RBAC

- **`User`** — one row per platform account. `role` (enum `Role`, 7 values), `status` (`ACTIVE`/`DISABLED`), `canCreateUsers` (bool, `POLLING_UNIT_OFFICER`-only escape hatch, `SUPER_ADMIN`-controlled), one scope FK each to `SenatorialDistrict`/`LGA`/`Ward`/`PollingUnit` (exactly one meaningful per role — see `AUTHORIZATION.md`), self-referencing `createdBy`/`createdUsers` (audit trail, not authorization), `lastLoginAt`. Indexed on `role` and each scope FK.
- **`RefreshToken`** — `tokenHash` (unique, never the raw token), `expiresAt`, `revokedAt`, cascades on `User` delete.
- **`RolePermission`** — DB-backed default permission grants per `Role` (unique on `[role, permission]`); empty for a role falls back to the code default in `AuthorizationService`.
- **`UserPermission`** — per-user override, `effect` (`GRANT`/`REVOKE`), `grantedById`, unique on `[userId, permission]`.
- **`UserScope`** — additional geographic units beyond the primary scope field, unique on the full `[userId, ...4 scope FKs]` tuple, `createdById` records who granted it (`SUPER_ADMIN` only, enforced in code not the schema).

`permission` is stored as a plain `String`, not a Postgres enum, in both
`RolePermission`/`UserPermission` and their campaign equivalents — the
catalog can grow without a migration, validated against the code list in
`apps/api/src/common/authorization/permissions.ts` at the application
layer instead.

## 2. Organizational hierarchy

`State` → `SenatorialDistrict` → `LGA` → `Ward` → `PollingUnit`, every
level with `status` (`ACTIVE`/`INACTIVE` — retire without deleting and
orphaning history) and an optional `code` (the official INEC delimitation
code where one applies; nullable because senatorial districts aren't a
coded INEC level, and ad hoc units created before an import have none).

- `State.code` and `State.name` unique.
- `SenatorialDistrict`: unique `[stateId, name]` and `[stateId, code]`.
- `LGA`: unique `[senatorialDistrictId, name]` and a bare unique `[code]`.
- `Ward`: unique `[lgaId, name]` and a bare unique `[code]`.
- `PollingUnit`: **no** `[wardId, name]` uniqueness — deliberately removed in migration `drop_polling_unit_ward_name_unique` because INEC's own register legitimately has multiple distinct polling units sharing one name within a ward (same building, different unit numbers), confirmed present in the real Gombe dataset. Uniqueness is enforced on `code` instead, which is nullable only for ad hoc units. Also carries import provenance fields: `source`, `sourceVersion`, `effectiveFrom`/`effectiveTo`, and unpopulated `latitude`/`longitude` (schema-ready, but the source data has zero coordinates for any of the 2,984 imported records, so these stay `null` rather than being estimated).

`Counter` is a single atomic per-key sequence table (e.g. key
`"member-2026"`) backing human-readable membership IDs
(`PDP-GC-2026-000001`), incremented via a raw atomic `UPDATE` so
concurrent member creation can't collide.

See `GEOGRAPHY.md` for what data actually populates this hierarchy today.

## 3. Membership

- **`Member`** — party membership record. `membershipId` (unique, generated), demographic fields, required `pollingUnitId`/`wardId`/`lgaId` (denormalized ancestor chain, all three always set — not just the leaf), `status` (`PENDING`/`ACTIVE`/`INACTIVE`/`SUSPENDED`), soft-delete via nullable `deletedAt`. Indexed on each scope FK, `status`, `[surname, firstName]`, `phone`, `email`.
  - `educationLevel` (`EducationLevel?` enum — closed vocabulary, not free text) + `educationLevelOther` (only meaningful when `educationLevel = OTHER`).
  - `ninEncrypted` (`String?`, AES-256-GCM ciphertext, base64) + `ninHash` (`String? @unique`, deterministic HMAC-SHA256) — the National Identification Number is **never stored in plaintext or indexed**; `ninHash` exists solely so a duplicate NIN can be detected without ever decrypting anything. See `common/crypto/field-encryption.ts` and `AUTHORIZATION.md` §10 for the SUPER_ADMIN-only read path.
  - `pvcNumber` (`String? @unique`) — the PVC (Permanent Voter's Card) identifier, normalized (trimmed, uppercased) before storage; a plain unique string like `membershipId`/`email`, not encrypted (not NIN-tier sensitive per the platform's data classification).
  - All three groups are nullable so every pre-existing member row remains valid; nothing in this migration touches or backfills existing data.
- **`MemberQRCode`** — one-to-one with `Member`, `token` unique and opaque (no PII encoded — see `qr.service.ts`), `status` (`ACTIVE`/`REVOKED`). NIN/PVC are never encoded into this token or its rendered image.

## 4. Audit log

- **`AuditLog`** — `actorId` (nullable — a failed-login attempt has no
  authenticated actor yet), `action` (plain string, ~50+ distinct values
  defined in `AuditAction`, `apps/api/src/audit/audit.service.ts`),
  `entityType`/`entityId`, `metadata` (`Json?`, free-form context per
  action). No update or delete endpoint exists anywhere in the API for
  this table — immutability is enforced at the application layer (there
  is no DB trigger or `REVOKE UPDATE` grant), not the database. Indexed
  on `actorId`, `[entityType, entityId]`, `action`, `createdAt`.

## 5. Activities — events & attendance

- **`Event`** — `status` (`DRAFT`/`UPCOMING`/`ACTIVE`/`COMPLETED`/`CANCELLED`), optional `targetLga`/`targetWard`/`targetPollingUnit` (all three null = district-wide), `organizerId` required.
- **`Attendance`** — links `Event` + `Member`, `method` (shared `VerificationMethod` enum: `QR`/`MEMBERSHIP_ID`/`SEARCH`), **`@@unique([eventId, memberId])`** — the database itself, not just application logic, prevents a duplicate check-in even under a race.

## 6. Resources

- **`Resource`** — `totalQuantity` (ever received, including restocks) vs. `remainingQuantity` (not yet allocated); optional `campaignId` FK tags a resource as belonging to a campaign (see section 8) rather than duplicating the model.
- **`ResourceAllocation`** — `quantity` (originally allocated) vs. `remainingQuantity` (not yet used), required `targetLgaId` (every allocation targets a concrete unit — no district-wide allocation, unlike `Event`), optional `distributionId` when the allocation was made under a `Distribution` campaign rather than general resource management — both paths share the same `Resource.remainingQuantity` pool via the same atomic-decrement code path.
- **`ResourceTransaction`** — `type` (`USAGE`, always positive / `ADJUSTMENT`, signed correction) recorded against an allocation.

## 7. Distribution

- **`Distribution`** — a member-facing campaign to distribute a `Resource`, built on top of `ResourceAllocation` rather than a separate stock model. `status`: `DRAFT`/`ACTIVE`/`COMPLETED`/`CANCELLED`.
- **`DistributionReceipt`** — links `Distribution` + `ResourceAllocation` + `Member`, `status` (`CONFIRMED`/`REVERSED`), **`@@unique([distributionId, memberId])`** prevents duplicate receipts at the database level. A reversed receipt is reactivated in place on re-issue (per the schema comment, verified against `DistributionsService`) rather than inserting a second row, so the constraint holds across reversal.

## 8. Documents

- **`Document`** — `storedFileName` (randomized, unique, distinct from the user-facing `fileName`), `restrictedToAdmins` (bool). Files live outside the public `/uploads` static path and are served only through an authenticated, permission-checked download endpoint — the schema comment states a restricted document "must never be reachable by URL alone," consistent with the controller behavior described in `SECURITY.md`. Soft-delete via `deletedAt`.

## 8b. Admin-only internal messaging

- **`Message`** — one row per sender→recipient exchange, both always `User`s (never a `Member`). `subject`/`body`, `readAt` (nullable — unread until the recipient opens it), `parentMessageId` (self-referential FK; a reply is a new row linked to the original, not a separate thread table), per-side `deletedBySender`/`deletedByRecipient` booleans (mailbox-view soft removal only — never a hard delete, so the other participant's copy and any audit trail are unaffected). Indexed on `senderId`, `recipientId`, `[recipientId, readAt]` (unread-count queries), `parentMessageId`, `createdAt`.
- **`MessageAttachment`** — `fileName` (original, shown to users) vs. `storedFileName` (randomized, unique, on-disk name — same convention as `Document.storedFileName`), `mimeType`/`fileSize`. Cascades on `Message` delete. Files live in `message-attachments/` (git-ignored, outside the public `/uploads` static path) and are served only through an authenticated, per-message-participant-checked download endpoint — see `AUTHORIZATION.md` §10.
- Eligibility to create a `Message` (and to read/download an existing one) is authorization logic, not a schema constraint — see `OrgScopeService.canCommunicateWith` in `AUTHORIZATION.md` §7/§10.

## 9. Campaign Operations

A second operational + authorization domain layered on the **same**
geography tables and the **same** `AuditLog` — not a duplicated schema.
See `CAMPAIGN.md` for the full functional description; structurally:

- **`Campaign`** — one row per election campaign (currently one: PDP Gombe State 2027 Governorship, see `seed.ts`). Not hardcoded to any candidate in code — `candidateName`/`candidateTitle`/`candidateBio`/`candidatePhotoUrl`/`party`/`electionType`/`electionYear` are all data.
- **`CampaignMembership`** — a `User`'s campaign identity: `role` (`CampaignRole`, 11 values), `status`, one scope FK (same "exactly one meaningful field" pattern as `User`), unique on `[campaignId, userId]` — a user has at most one membership per campaign.
- **`CampaignRolePermission`** / **`CampaignMembershipPermission`** — direct mirrors of `RolePermission`/`UserPermission` for the `campaign.*` permission namespace.
- **`CampaignTeam`** / **`CampaignTeamMember`** — a team belongs to a geographic unit and has an optional `coordinatorId` (a `CampaignMembership`); a team member is either a `CampaignMembership` or a `CampaignVolunteer` (exactly one of the two FKs set, enforced in `CampaignTeamsService`, not a DB constraint).
- **`CampaignVolunteer`** — deliberately its own model, not a flag on `Member`: an optional `memberId` links a volunteer to a party member only when that fact is true; not every volunteer is a member and not every member is a volunteer.
- **`CampaignEvent`** / **`CampaignAttendance`** — deliberately separate from `Event`/`Attendance`: an attendee here is recorded only as present (`CHECKED_IN`/`CHECKED_OUT`/`NO_SHOW`), never as a member, volunteer, or inferred supporter. `attendeeType` can be `MEMBER`/`VOLUNTEER`/`GUEST`; unique on both `[eventId, memberId]` and `[eventId, volunteerId]`.
- **`CampaignTask`** — assignable to a `CampaignMembership` and/or a `CampaignTeam` and/or tied to a `CampaignEvent`; `priority` (`LOW`/`MEDIUM`/`HIGH`/`URGENT`), `status` (`PENDING`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED`).
- **`CampaignActivity`** — a curated operational narrative ("what happened, where, who was responsible"), explicitly distinct in the schema comment from `AuditLog` (the security/mutation trail) — not meant to be read as a security record.

## Notable schema decisions worth knowing when reading the code

- **No coordinate data**: `PollingUnit.latitude`/`longitude` exist but are `null` for all 2,984 imported records — the INEC source carries none. Do not build a map feature assuming this data is populated.
- **Denormalized ancestor chains** (`Member`, `Event`, `ResourceAllocation`, and every campaign geo-scoped model) store the full LGA/Ward/PollingUnit chain rather than just a leaf FK, specifically so scope-filtering queries (`OrgScopeService`) can be a plain equality/OR filter instead of a recursive join.
- **Resource reuse for campaigns**: `Resource.campaignId` is nullable — the same table serves both party-wide and campaign-scoped resources rather than a parallel `CampaignResource` model.
- **`permission` as a string, not an enum**, in all four permission tables — a deliberate tradeoff to avoid a migration every time the permission catalog changes; validity is enforced in application code (`isPermission()`/`isCampaignPermission()`), not the database.
- **`AuditLog.action` is also a plain string** for the same reason, covering both administrative and campaign action names in one table.
