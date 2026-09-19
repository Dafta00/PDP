# Authorization

Every claim in this document was checked against the source listed next to
it. This is the single most security-critical document in the repository —
read it alongside the code, not instead of it.

## The four independent axes

Every protected operation is the product of four checks, enforced
**server-side**:

1. **Authentication** — is there a valid, non-expired JWT for an `ACTIVE` user? (`JwtAuthGuard`, `apps/api/src/common/guards/jwt-auth.guard.ts`; the strategy rejects a `DISABLED` account even with a valid token — `apps/api/src/auth/strategies/jwt.strategy.ts`)
2. **Role authority** — is this user's role even permitted near this endpoint? (`RolesGuard` + `@Roles(...)`, coarse-grained)
3. **Permission** — does this *specific user* (role default ± personal override) hold the exact capability? (`PermissionsGuard` + `@RequirePermissions(...)`, fine-grained)
4. **Geographic scope** — is the *specific record* inside the boundary this user is allowed to touch? (enforced in the service layer via `OrgScopeService` / `AuthorizationService`, never in the controller)

The frontend (`nav-config.ts`, `canSeeNavItem`) hides menu items a user
can't use, but this is explicitly a UX convenience — nothing about it is
trusted server-side. Every one of the four checks above runs again on the
backend regardless of what the client sent.

Administrative and Campaign operations are two **entirely separate**
instances of this pattern, sharing only the login/JWT layer and the
geography tables. A user's administrative `Role` grants nothing in the
campaign domain, and a `CampaignRole` grants nothing administratively.

---

## 1. Administrative role hierarchy

Defined once, in `apps/api/src/common/authorization/authorization.service.ts`:

```
SUPER_ADMIN            (rank 0 — highest)
STATE_ADMIN             (rank 1)
SENATORIAL_ADMIN        (rank 2)
LGA_ADMIN               (rank 3)
WARD_ADMIN              (rank 4)
POLLING_UNIT_OFFICER    (rank 5)
DATA_ENTRY_OFFICER      (rank 6 — lowest)
```

Rule (`hierarchyAllows()`): a user may only create/assign/manage a target
whose rank is **strictly greater** (lower authority) than their own —
never equal, never higher. **`SUPER_ADMIN` is the sole exception**: it may
manage any role including another `SUPER_ADMIN`, per its documented status
as "the system's only unrestricted administrative authority." This means:

- `STATE_ADMIN` cannot create another `STATE_ADMIN` or a `SUPER_ADMIN` (rank check fails: target rank ≤ actor rank).
- `SENATORIAL_ADMIN` cannot create `SUPER_ADMIN`, `STATE_ADMIN`, or another `SENATORIAL_ADMIN`.
- `DATA_ENTRY_OFFICER` (lowest rank) can never manage anyone — there is no rank below it, so the rank check always fails. This falls out of the rank arithmetic; there is no separate special case for it.
- `POLLING_UNIT_OFFICER` is additionally gated by a **per-account boolean**, `User.canCreateUsers` (default `false`). Even when granted, `findDenialReason()` restricts them to creating `DATA_ENTRY_OFFICER` accounts only, in their own polling unit. Only `SUPER_ADMIN` can flip this flag (`UsersService.create`/`update`).

There is **no** administrative endpoint to create a `SUPER_ADMIN` in the
normal user-management flow that bypasses this rule — the only way a
`SUPER_ADMIN` account is created is the seed script
(`prisma/seed.ts` → `seedSuperAdmin()`), reading
`SEED_SUPER_ADMIN_EMAIL`/`SEED_SUPER_ADMIN_PASSWORD` from the environment,
or by an existing `SUPER_ADMIN` explicitly assigning that role through the
normal API (permitted by the exemption above).

## 2. Campaign role hierarchy

Defined in `apps/api/src/campaign/authorization/campaign-authorization.service.ts`,
against the separate `CampaignRole` enum (`prisma/schema.prisma`):

```
Geographic coordinator ladder (ranked):
  CAMPAIGN_SUPER_ADMIN
  STATE_CAMPAIGN_COORDINATOR
  DISTRICT_COORDINATOR
  LGA_COORDINATOR
  WARD_COORDINATOR
  POLLING_UNIT_COORDINATOR

Functional specialist roles (fixed lowest tier, unranked among themselves):
  CAMPAIGN_DATA_OFFICER
  EVENT_COORDINATOR
  LOGISTICS_OFFICER
  VOLUNTEER_COORDINATOR
  REPORT_VIEWER
```

Rule (`campaignHierarchyAllows()`):
- `CAMPAIGN_SUPER_ADMIN` may assign anything, including itself (same exemption pattern as `SUPER_ADMIN`).
- Any geographic coordinator may assign a strictly-lower geographic coordinator role **or** any functional specialist role (functional roles are "narrow purpose," not a rung on the geographic ladder — any coordinator may hand one out within their own scope).
- **Functional specialist roles can never manage another campaign user at all** — `campaignHierarchyAllows` returns `false` unconditionally when the actor holds one of the five functional roles, regardless of target.

This is a **separate table and separate enforcement path** from the
administrative hierarchy above — see `CAMPAIGN.md` for the full campaign
authorization story, including its own self-escalation and IDOR
protections (they mirror the patterns below exactly, against
`CampaignMembership` instead of `User`).

## 3. Permission system

Two independent, parallel permission catalogs — plain strings, not a
database enum (so the catalog can grow without a schema migration; the
same tradeoff already used for `AuditLog.action`):

- **Administrative**: 43 permissions, `apps/api/src/common/authorization/permissions.ts`, `PERMISSIONS` const.
- **Campaign**: 31 permissions, `apps/api/src/campaign/authorization/campaign-permissions.ts`, `CAMPAIGN_PERMISSIONS` const.

Administrative categories (43 total): `dashboard` (1), `members` (6:
view/create/update/deactivate/verify/export), `organization` (2:
view/manage), `geography` (2: view/manage), `events` (4:
view/create/update/delete) + `attendance.manage` (1), `resources` (4:
view/create/update/manage), `allocations` (3: view/create/approve),
`distributions` (4: view/create/verify/cancel), `reports` (3:
view/generate/export), `users` (4: view/create/update/deactivate),
`roles` (4: view/create/update/delete), `permissions` (2: view/manage),
`audit.view` (1), `settings` (2: view/manage).

Campaign categories (31 total): `campaign.dashboard.view` (1),
`campaign.users` (4: view/create/update/deactivate), `campaign.events` (4:
view/create/update/delete), `campaign.attendance` (2: view/manage),
`campaign.teams` (4: view/create/update/manage), `campaign.volunteers` (3:
view/create/update), `campaign.tasks` (5:
view/create/assign/update/complete), `campaign.resources` (3:
view/request/allocate), `campaign.activity` (2: view/create),
`campaign.reports` (3: view/generate/export).

**Resolution**: `AuthorizationService.getEffectivePermissions(user)` =
DB-backed `RolePermission` rows for the user's role (falling back to a
hardcoded `DEFAULT_ROLE_PERMISSIONS` map only if the DB has no rows for
that role yet — i.e. an unseeded environment), with any `UserPermission`
override applied on top (`GRANT` adds, `REVOKE` removes). The campaign
side (`CampaignAuthorizationService.getEffectiveCampaignPermissions`)
works identically against `CampaignRolePermission`/`CampaignMembershipPermission`.

**Editing role defaults**: `PUT /api/permissions/roles/:role` (all API routes are served under a global `/api` prefix — see `ARCHITECTURE.md`) — restricted to
`SUPER_ADMIN` at the service layer (`AuthorizationService.setRolePermissions`
throws `ForbiddenException` for anyone else), regardless of what
permission the caller holds. This is a deliberate absolute rule, not just
a permission check: system role definitions are `SUPER_ADMIN`-only to
change.

**Delegation policy** (`AuthorizationService.canGrantPermission`): a user
may hand a permission override to someone else only if (a) they possess
it themselves, and (b) either they are `SUPER_ADMIN`, or the permission is
on the `DELEGABLE_PERMISSIONS` allowlist — every operational permission
*except* `dashboard.view` and `users.view`. The `users.*`/`roles.*`/`permissions.*`/`settings.*`/`audit.view`
families are never delegable by a non-`SUPER_ADMIN`, even if they somehow
hold one of them.

## 4. Geographic scope model

Every scoped administrative role stores its scope directly on `User`
(`senatorialDistrictId` / `lgaId` / `wardId` / `pollingUnitId` — exactly
one meaningful per fixed-scope role):

| Role | Scope field |
|---|---|
| `SUPER_ADMIN`, `STATE_ADMIN` | none (unrestricted, state-wide) |
| `SENATORIAL_ADMIN` | `senatorialDistrictId` |
| `LGA_ADMIN` | `lgaId` |
| `WARD_ADMIN` | `wardId` |
| `POLLING_UNIT_OFFICER` | `pollingUnitId` |
| `DATA_ENTRY_OFFICER` | configurable — whichever single field is set, resolved most-specific-first (polling unit → ward → LGA → district) |

**Containment check** (`OrgScopeService`/`AuthorizationService.isWithinScope`):
a target record's scope is "within" an actor's scope if it's the same unit
or a descendant of it. A `SENATORIAL_DISTRICT`-scoped actor's containment
check for an LGA target resolves the LGA's real `senatorialDistrictId`
from the database (never trusts a client-supplied district id on the
target) before comparing — this is what makes cross-district creation
attempts fail even if the request body claims an in-scope district.

**Multi-scope grants** (`UserScope` table): a `SUPER_ADMIN` may grant a
user one or more *additional* geographic units beyond their primary scope
field (e.g. a second LGA for an `LGA_ADMIN`). Creating a `UserScope` row is
`SUPER_ADMIN`-only (`UsersController.addScope`) — a scoped admin can never
grant themselves or anyone else an additional unit. Multi-scope is applied
in `memberScopeWhere`, `assertCanAccessOrgUnit`, and
`resourceAllocationScopeWhere`; it is **not** applied to event visibility,
report ancestor-widening, or `resolveScopePath` (UI breadcrumb) — those
three still use only the primary scope field. This is a disclosed,
intentional limitation (see code comments in `org-scope.service.ts`), not
an oversight.

## 5. User creation / modification restrictions

`UsersService.create()`/`update()` runs, in order:
1. `canonicalScope()` — reduces whatever scope fields the client sent down to the single field that's actually meaningful for the target role, discarding anything else the client included (defense against a request body that includes an extra, broader scope id hoping it gets used instead).
2. `assertScopeMatchesRole()` — the target role's required scope field must actually be present.
3. `AuthorizationService.canCreateUser`/`canUpdateUser` — the four-axis check above, using the actor's *own* stored role/scope (never anything from the request body).

Every denial from step 3 is audited via `USER_MANAGEMENT_DENIED`
(`AuditAction` enum, `apps/api/src/audit/audit.service.ts`), with the
actor's role/scope, the attempted target role/scope, and a machine-readable
`reasonCode` (`TARGET_ROLE_AUTHORITY_TOO_HIGH`,
`GEOGRAPHIC_SCOPE_VIOLATION`, `ACTOR_SCOPE_UNCONFIGURED`,
`PU_OFFICER_NOT_GRANTED`, `PU_OFFICER_INVALID_TARGET_ROLE`).

## 6. Self-escalation prevention

`UsersService.update()`: if the target id equals the caller's own id
**and** the request tries to change `role`, `status`, or any scope field,
the request is rejected outright (`ForbiddenException`) and audited as
`USER_MANAGEMENT_DENIED` with `reasonCode: SELF_ESCALATION_ATTEMPT` —
*before* any role-hierarchy check runs. This applies even to `SUPER_ADMIN`:
nobody can change their own role/status/scope through this endpoint, only
their own `fullName`. The campaign side
(`CampaignMembershipsService.update`) implements the identical rule
against `CampaignMembership`.

## 7. Server-side scope enforcement per module

Scope filtering is centralized in `OrgScopeService`
(`apps/api/src/common/scope/org-scope.service.ts`) and reused by every
module rather than reimplemented:

- `memberScopeWhere()` — Members list/search
- `assertCanAccessOrgUnit()` — single-record access checks (member update, event target, resource allocation target, etc.)
- `eventScopeWhere()` / `assertCanViewEvent()` — Events, including "see broader events above my own unit" (a ward officer sees an LGA-wide meeting)
- `resourceAllocationScopeWhere()` — Resource allocations
- `resolveVisibleUnits()` — which LGAs/wards an actor may see rows for, used by Reports
- `resolveScopePath()` — the named breadcrumb ("Gombe Central / Akko / Kumo Central") shown in the top nav; display only, never used for access control

A parallel `scopeWhere()` exists in `CampaignAuthorizationService` for the
same purpose inside the campaign module.

`OrgScopeService.canCommunicateWith(actor, target)` extends this same
geography model to admin-to-admin messaging (see §10) — two administrative
users may message each other when one's assigned unit contains (or equals)
the other's, computed via the same ancestor-resolution logic as
`eventScopeWhere`. It never widens data-visibility scope; it only answers
"may these two accounts exchange messages".

## 8. IDOR / BOLA prevention

No endpoint that accepts an id in the URL trusts that id alone.
`assertCanAccessOrgUnit` / `assertCanAccessCampaignScope` are called
*after* loading the record and *before* returning or mutating it, so
knowing a valid id for a record outside your scope still yields a
`403 Forbidden`, not the record. Verified by the following tests:

- `org-scope.service.spec.ts` — cross-district/LGA/ward access denial, including the multi-scope-grant cases
- `users.service.spec.ts` — the exact seven role+scope combinations from the spec this system was built against (`SENATORIAL_ADMIN`→LGA in/out of district, `LGA_ADMIN`→ward in/out of LGA, `WARD_ADMIN`→polling unit in/out of ward), plus explicit "malicious payload" tests (self-promotion to `SUPER_ADMIN`/`STATE_ADMIN` via `PATCH`, smuggling an out-of-scope id via extra body fields)
- `campaign-authorization.service.spec.ts` — the same matrix against `CampaignRole`/`CampaignMembership`

## 9. What is verified vs. what is not

Verified by direct code inspection and a passing test suite (227/227 as of
this writing, `pnpm --filter api test`):
- Role rank hierarchy (both domains) and the `SUPER_ADMIN`/`CAMPAIGN_SUPER_ADMIN` exemption
- Geographic containment logic, including ancestor resolution
- Self-escalation blocking
- Permission delegation allowlist
- Audit logging of denials
- The absolute SUPER_ADMIN-only NIN rule and admin-messaging scope containment (§10)

Not implemented (do not assume these exist):
- No UI or API exists for a non-`SUPER_ADMIN` to request elevated access ("approval workflow") — escalation requests simply don't exist as a concept.
- No time-boxed/temporary role or scope grants — every assignment is permanent until explicitly changed.
- No campaign-side equivalent of `UserScope` (multi-scope grants) — a `CampaignMembership` has exactly one scope, full stop.

## 10. Sensitive member data (NIN) and admin messaging

**NIN — absolute SUPER_ADMIN-only rule.** `AuthorizationService.canViewMemberNIN(actor)`
(`apps/api/src/common/authorization/authorization.service.ts`) is a hard role
check — `return actor.role === Role.SUPER_ADMIN` — deliberately **not**
permission-based, so it can never be widened by a `UserPermission` GRANT the
way every other capability in this system can. `MembersService` is the only
caller: its private `shapeMemberDetail()` strips `ninEncrypted`/`ninHash`
from every response and only attaches a decrypted `nin` field when this
check passes, logging `AuditAction.MEMBER_NIN_VIEWED` each time it does. NIN
is stored encrypted (`Member.ninEncrypted`, AES-256-GCM via
`common/crypto/field-encryption.ts`) with a separate deterministic HMAC
(`Member.ninHash`, `@unique`) backing duplicate detection — the plaintext is
never indexed, logged, or present in the member list/search/report/export
projections at all, only the single detail-response path above.

**Admin-only internal messaging.** Members never participate — both parties
on a `Message` row are always administrative `User`s. Eligibility to send
*and* every read/download is authorized by
`OrgScopeService.canCommunicateWith(actor, target)` (§7), re-derived from the
database on every request — a client-submitted `recipientId` is never
trusted as proof of authorization, and `messages.view`/`messages.send`
gate the module's endpoints on top of that. Reading a message the actor is
neither the sender nor recipient of returns `404 Not Found` (never `403`),
matching the existing "don't confirm existence" convention from `Document`
(§8); the same 404-not-403 rule applies to attachment downloads. Denied
sends and unauthorized read attempts are audit-logged
(`MESSAGE_AUTHORIZATION_DENIED`). See `messages.service.spec.ts` and the
`canCommunicateWith` cases in `org-scope.service.spec.ts` for the verified
scope-containment matrix (superior↔subordinate allowed, unrelated same-level
peers denied, `SUPER_ADMIN`/`STATE_ADMIN` unrestricted both ways).
