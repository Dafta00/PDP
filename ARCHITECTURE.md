# Architecture

This document describes the actual structure of the PDP Gombe State
Management Platform as implemented — not a target design. Every module,
service, and route named here exists in the codebase at the time of writing.

## System shape

```
ONE application, ONE authentication system, ONE database, ONE geographic
hierarchy, ONE authorization architecture — with multiple administrative
and campaign scopes layered on top of it.
```

There is no per-district application or database. Gombe Central, Gombe
North, and Gombe South are rows in the same `SenatorialDistrict` table,
scoped by the same authorization layer (see `AUTHORIZATION.md`).

## Stack

| Layer | Technology |
|---|---|
| API | NestJS 10 + TypeScript, Express under the hood |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Web | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Server state (web) | TanStack Query v5 |
| Client auth/app state (web) | React Context (`AuthProvider`, `CampaignProvider`, `ToastProvider`, `MobileNavProvider`) — no Redux/Zustand/etc. is present |
| Auth | JWT access + refresh tokens (`passport-jwt`), bcrypt password hashing |
| Icons | `lucide-react` throughout; no emoji icons in the UI |

## Monorepo layout

```
pnpm-workspace.yaml        packages: apps/*
apps/api/                  NestJS backend
  src/
    auth/                  login, refresh, logout, /auth/me
    users/                 administrative user + role/scope/permission management
    permissions/           permission catalog + role-default permission endpoints
    common/
      guards/              JwtAuthGuard, RolesGuard, PermissionsGuard
      decorators/          @Roles, @RequirePermissions, @CurrentUser
      scope/               OrgScopeService (geographic filtering), member-scope-sql helper
      authorization/       AuthorizationService, permissions.ts (catalog)
      types/                AuthenticatedUser
      filters/              AllExceptionsFilter
    organization/          State/SenatorialDistrict/LGA/Ward/PollingUnit CRUD
    members/               party membership
    verification/          member lookup (QR / membership ID / phone)
    qr/                    QR issuance/resolution (shared by members + attendance + distribution)
    events/, attendance/   party events and check-in
    resources/             inventory, allocations, usage transactions
    distributions/         member-facing distribution campaigns (built on resources)
    documents/             organizational file management
    reports/               computed, scope-filtered reports
    dashboard/             dashboard stats aggregation
    audit/                 immutable audit log
    files/                 generic file upload endpoint
    campaign/               Campaign Operations module (see CAMPAIGN.md)
      authorization/        CampaignAuthorizationService, campaign-permissions.ts
  prisma/
    schema.prisma
    migrations/             12 migrations, all additive (see DATABASE.md)
    seed.ts
    data/inec/              imported geographic source data (see GEOGRAPHY.md)
    scripts/                import-inec-gombe.ts, validate-org-hierarchy.ts

apps/web/                  Next.js frontend
  src/
    app/(dashboard)/        authenticated routes (members, organization, events,
                             attendance, resources, distributions, documents,
                             reports, users/[id], audit-logs, verification,
                             campaign/*)
    app/login/               login page
    components/ui/          Button, Input, Card, Badge/StatusBadge, Avatar,
                             Breadcrumb, PageHeader, StatCard, Table, Tabs,
                             ConfirmDialog, EmptyState/LoadingState/ErrorState
    components/layout/      Sidebar, Topbar, nav-config, scope-indicator,
                             mobile-nav-context
    lib/                    api-client, auth-context, campaign-context,
                             campaign-hooks, role-hierarchy,
                             campaign-role-hierarchy, toast-context,
                             query-provider, csv-export, *-types.ts
```

## Request flow

Every API route is served under a global `/api` prefix
(`app.setGlobalPrefix('api')`, `main.ts`) — e.g. login is
`POST /api/auth/login`, not `POST /auth/login`. Route paths named
elsewhere in this documentation set (`AUTHORIZATION.md`, `CAMPAIGN.md`)
omit this prefix for brevity; assume it everywhere.

Every protected API request passes through, in order:

1. `JwtAuthGuard` — validates the bearer token, loads the current `User`
   row (rejects if the account is `DISABLED`), populates `request.user`.
2. `RolesGuard` (where a controller declares `@Roles(...)`) — coarse
   role-based gate.
3. `PermissionsGuard` / `CampaignPermissionsGuard` (where a route declares
   `@RequirePermissions(...)` / `@RequireCampaignPermissions(...)`) —
   fine-grained permission check against the effective permission set
   (role defaults + per-user overrides).
4. The service layer — geographic scope filtering
   (`OrgScopeService`/`CampaignAuthorizationService`) and business logic.
   This is where "can this user see/touch *this specific record*" is
   actually enforced, not in the controller or the frontend.

See `AUTHORIZATION.md` for the full breakdown of each layer.

## Frontend state

- **Authenticated user, permissions, scope**: `AuthProvider`
  (`lib/auth-context.tsx`) — fetched from `/auth/login` and `/auth/me`,
  held in React state, access token in memory, refresh token in
  `localStorage`.
- **Campaign identity**: `CampaignProvider` (`lib/campaign-context.tsx`) —
  a separate context, fetched from `/campaigns` and
  `/campaigns/:id/me`, independent of the administrative auth context.
- **Server data**: TanStack Query hooks per page/resource — no global
  client-side data store; each page fetches what it needs and relies on
  query-key invalidation after mutations.
- **Navigation visibility**: `nav-config.ts`'s `canSeeNavItem()` filters
  the sidebar by the user's administrative role and (for the Campaign
  section) by whether a `CampaignProvider` membership was found. This is
  a UX convenience only — every route it hides is independently
  re-enforced server-side.

## Design system

Centralized in `apps/web/tailwind.config.ts` and `apps/web/src/app/globals.css`:
a PDP-green (`brand-*`) primary scale, a reserved `party-red` accent for
brand-identity contexts only (never status/interactive UI), and semantic
`success`/`warning`/`info` scales. Typography pairs `Lexend` (headings) with
`Source Sans 3` (body), loaded via `next/font/google`. Components in
`components/ui/` consume these tokens rather than hardcoded colors.

## Testing

15 Jest suites, 179 tests, all unit-level (mocked Prisma client, no test
database). Run with `pnpm --filter api test`. See `AUTHORIZATION.md` and
`CAMPAIGN.md` for what the authorization-specific suites cover.

## What this document does not claim

- No CI/CD pipeline is defined in this repository (no `.github/workflows`
  or equivalent found).
- No containerization exists for the API or web app themselves — only
  PostgreSQL runs in Docker (`docker-compose.yml`).
- No end-to-end/integration test suite exists; all 179 tests are unit
  tests against mocked dependencies.
