# Campaign Operations

The Campaign Operations module is a second, self-contained operational
and authorization domain layered on the same login, geography, and audit
infrastructure as the core party-membership platform. This document
describes what is actually built, verified against
`apps/api/src/campaign/**`, `apps/web/src/app/(dashboard)/campaign/**`,
and `prisma/schema.prisma`.

## What it is, in one paragraph

One seeded campaign — "PDP Gombe State 2027 Governorship Campaign,"
candidate Professor Isa Ali Ibrahim Pantami (`prisma/seed.ts`,
`seedCampaign()`) — with its own membership/role/permission system
(`CampaignMembership`/`CampaignRole`), independent of a user's
administrative `Role`, used to run Teams, Volunteers, Events, Attendance,
Tasks, Activity logging, and read-only Resource/Reports views scoped to
the same State→District→LGA→Ward→PollingUnit hierarchy the rest of the
platform uses. The candidate profile itself (name, title, bio, photo) is
data on the `Campaign` row, not hardcoded in code.

## Roles

Defined in `CampaignRole` (`prisma/schema.prisma`) and enforced by
`CampaignAuthorizationService`:

**Geographic coordinator ladder** (ranked, each may manage strictly-lower
ranks plus any functional role, within their own scope):
`CAMPAIGN_SUPER_ADMIN` → `STATE_CAMPAIGN_COORDINATOR` →
`DISTRICT_COORDINATOR` → `LGA_COORDINATOR` → `WARD_COORDINATOR` →
`POLLING_UNIT_COORDINATOR`.

**Functional specialist roles** (fixed lowest tier, never able to manage
another campaign user, per `campaignHierarchyAllows()`):
`CAMPAIGN_DATA_OFFICER`, `EVENT_COORDINATOR`, `LOGISTICS_OFFICER`,
`VOLUNTEER_COORDINATOR`, `REPORT_VIEWER`.

A user holds **at most one `CampaignMembership` per campaign**
(`@@unique([campaignId, userId])`) — a single `User` account can be both
an administrative `LGA_ADMIN` and a campaign `WARD_COORDINATOR`
simultaneously, with each identity fully independent of the other.

## Permissions

31 permissions (`CAMPAIGN_PERMISSIONS`,
`apps/api/src/campaign/authorization/campaign-permissions.ts`), namespaced
`campaign.*`: `dashboard.view` (1); `users` (4: view/create/update/deactivate);
`events` (4: view/create/update/delete); `attendance` (2: view/manage);
`teams` (4: view/create/update/manage); `volunteers` (3:
view/create/update); `tasks` (5: view/create/assign/update/complete);
`resources` (3: view/request/allocate); `activity` (2: view/create);
`reports` (3: view/generate/export).

Role defaults (`DEFAULT_CAMPAIGN_ROLE_PERMISSIONS`): all six geographic
coordinator roles except `POLLING_UNIT_COORDINATOR` get the *full*
operational permission set — per the code comment, what actually limits
them is role rank + geographic scope, not a narrower permission list.
`POLLING_UNIT_COORDINATOR` and the five functional roles each get a
hand-picked subset matching their name (e.g. `LOGISTICS_OFFICER` gets all
three `resources.*` permissions plus tasks/activity/reports, but nothing
about events/teams/volunteers). DB-backed via `CampaignRolePermission`,
overridable per-membership via `CampaignMembershipPermission` — the exact
same GRANT/REVOKE pattern as the administrative side.

## Geographic scope

Same containment logic as the administrative domain, reimplemented for
this domain rather than shared (`CampaignAuthorizationService.isWithinScope`):
a `DISTRICT_COORDINATOR`'s district-scope check resolves a target's real
LGA/ward/polling-unit ancestry from the database before comparing, so a
client can't claim in-scope geography for an out-of-scope record. There
is **no multi-scope grant equivalent to `UserScope`** on the campaign
side — a `CampaignMembership` has exactly one scope, always.

`scopeWhere()` builds the Prisma filter used by every list endpoint
(teams, volunteers, events, tasks, activity) — an `UNRESTRICTED` actor
(`CAMPAIGN_SUPER_ADMIN`/`STATE_CAMPAIGN_COORDINATOR`) sees everything; a
scoped coordinator sees their unit and everything beneath it via nested
`OR` conditions across the ancestor chain.

## Self-escalation & privilege escalation prevention

Mirrors the administrative rule exactly: a campaign user cannot change
their own `role` or geographic scope through
`CampaignMembershipsService.update` (audited as
`CAMPAIGN_MANAGEMENT_DENIED` with `reasonCode: SELF_ESCALATION_ATTEMPT`).
Assigning a role/scope to *someone else* runs
`evaluateMembershipChange()`: role-hierarchy check first
(`TARGET_ROLE_AUTHORITY_TOO_HIGH` on failure), then scope-containment
(`GEOGRAPHIC_SCOPE_VIOLATION`), then an unconfigured-actor-scope guard
(`ACTOR_SCOPE_UNCONFIGURED`). Every denial is audited with a
machine-readable `reasonCode`, same as the administrative side.

## API surface

9 controllers, all under `/campaigns` (and, like every route in the API, served under the global `/api` prefix — see `ARCHITECTURE.md` — so in practice `/api/campaigns/...`):

| Controller | Routes |
|---|---|
| `campaigns.controller.ts` | `POST /campaigns`, `GET /campaigns`, `GET /campaigns/:campaignId`, `GET /campaigns/:campaignId/me`, `PATCH /campaigns/:campaignId` |
| `campaign-memberships.controller.ts` | `POST/GET /campaigns/:campaignId/users`, `GET/PATCH /campaigns/:campaignId/users/:id` |
| `campaign-teams.controller.ts` | `POST/GET /campaigns/:campaignId/teams`, `GET/PATCH /campaigns/:campaignId/teams/:id`, `POST /campaigns/:campaignId/teams/:id/members`, `DELETE /campaigns/:campaignId/teams/:id/members/:memberId` |
| `campaign-volunteers.controller.ts` | `POST/GET /campaigns/:campaignId/volunteers`, `GET/PATCH /campaigns/:campaignId/volunteers/:id` |
| `campaign-events.controller.ts` | `POST/GET /campaigns/:campaignId/events`, `GET/PATCH /campaigns/:campaignId/events/:id` |
| `campaign-attendance.controller.ts` | `POST/GET /campaigns/:campaignId/events/:eventId/attendance`, `PATCH .../attendance/:id/check-out` |
| `campaign-tasks.controller.ts` | `POST/GET /campaigns/:campaignId/tasks`, `GET/PATCH /campaigns/:campaignId/tasks/:id`, `PATCH .../tasks/:id/complete` |
| `campaign-activity.controller.ts` | `POST/GET /campaigns/:campaignId/activity` |
| `campaign-reports.controller.ts` | `GET /campaigns/:campaignId/dashboard`, `GET .../coverage`, `GET .../reports/{events,attendance,teams,volunteers,tasks,resources}` |

Every route requires an active `CampaignMembership`
(`CampaignMembershipGuard`) plus the relevant
`@RequireCampaignPermissions(...)` (`CampaignPermissionsGuard`) — the same
four-axis pattern described in `AUTHORIZATION.md`, applied to this
separate domain.

## Frontend

13 pages under `apps/web/src/app/(dashboard)/campaign/`: `page.tsx`
(campaign dashboard), `organization/`, `access/` (campaign user
management), `teams/` + `teams/[id]/`, `volunteers/`, `events/` +
`events/[id]/`, `tasks/`, `activity/`, `resources/`, `reports/`,
`candidate/` (candidate profile). Visibility is gated by
`CampaignProvider` (`lib/campaign-context.tsx`) finding an active
membership for the current user — a user with no campaign membership
never sees the Campaign section in the sidebar at all
(`nav-config.ts`/`sidebar.tsx`), though this is UX-only and every route
is independently re-enforced server-side.

## Resource handling — reuse, not duplication

Campaign resources are **not** a separate inventory system. A `Resource`
row is tagged to a campaign via a nullable `Resource.campaignId` FK, and
allocation/usage flows through the exact same `Resource`/
`ResourceAllocation`/`ResourceTransaction` tables and code paths used
platform-wide (see `DATABASE.md`). The Campaign Resources page
(`campaign/resources/page.tsx`) is **read-only** — it lists resources
tagged to the campaign (via `GET /campaigns/:id/reports/resources`) and
links out to the main `/resources` Resource Inventory page for actual
creation, restocking, or allocation.

**Disclosed gap**: the `campaign.resources.request` and
`campaign.resources.allocate` permissions exist in the catalog and are
granted to several roles (e.g. `LOGISTICS_OFFICER`), but there is no
dedicated campaign-side endpoint or UI to act on a resource request or
allocation — those actions currently only exist through the general
Resource Inventory pages/endpoints. The permissions are defined ahead of
a workflow that doesn't yet exist for this specific module.

## Deliberate separation from the party-membership domain

The schema header and multiple model comments state this explicitly, and
it's borne out in the code:

- `CampaignVolunteer` is its own model, not a flag on `Member` — an optional `memberId` links the two only when a volunteer genuinely is also a registered party member.
- `CampaignEvent`/`CampaignAttendance` are separate from `Event`/`Attendance` — a campaign attendee is recorded only as present (`CHECKED_IN`/`CHECKED_OUT`/`NO_SHOW`, `attendeeType` of `MEMBER`/`VOLUNTEER`/`GUEST`), never as an inferred supporter, member, or volunteer.
- `CampaignActivity` (an operational narrative feed) is explicitly distinct from `AuditLog` (the security/mutation trail) — they serve different audiences and are not interchangeable.

There is no feature anywhere in this module for scoring, ranking, or
inferring an individual's political preference — it records operational
facts (who did what, where, when) and nothing else.

## Tests

`campaign-authorization.service.spec.ts` and
`campaign-memberships.service.spec.ts` cover the role hierarchy, scope
containment, and self-escalation/IDOR cases for this domain, mirroring
the administrative test coverage described in `AUTHORIZATION.md`.
