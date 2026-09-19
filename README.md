# PDP Gombe State Management Platform

A party membership, administrative, and campaign-operations platform for
PDP Gombe State — covering party membership (including education level,
NIN, and PVC identification with strict SUPER_ADMIN-only NIN access),
organizational hierarchy, events/attendance, resources, distribution,
documents, reporting, admin-only internal messaging, and a separate
Campaign Operations module for the PDP Gombe State 2027 Governorship
campaign (candidate: Professor Isa Ali Ibrahim Pantami).

One application, one authentication system, one PostgreSQL database, one
geographic hierarchy — with administrative and campaign authorization
layered independently on top. See `ARCHITECTURE.md` for the full shape.

## Stack

- **API**: NestJS 10 + TypeScript + Prisma 5, PostgreSQL 16
- **Web**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + TanStack Query
- **Auth**: JWT access/refresh tokens, bcrypt password hashing, RBAC + granular permissions enforced server-side at every layer

## Quick start

```bash
pnpm install
cp .env.example .env               # edit secrets/CORS_ORIGIN before production use
docker compose up -d               # PostgreSQL on port 5439
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
pnpm --filter api prisma:seed      # State/Districts/LGAs, a SUPER_ADMIN, role permissions, the one Campaign
pnpm --filter api import:inec-gombe    # real INEC wards + polling units — see GEOGRAPHY.md

pnpm dev:api    # http://localhost:4055  (routes under /api)
pnpm dev:web    # http://localhost:3055
```

Full setup, every environment variable, and the production build process:
see **`DEPLOYMENT.md`**.

Seeded super admin: value of `SEED_SUPER_ADMIN_EMAIL` /
`SEED_SUPER_ADMIN_PASSWORD` in `.env` (defaults:
`admin@pdpgombecentral.org` / `ChangeMe123!`). **Change this password
after first login.**

## Documentation

This README is an overview; each of these covers one area in depth and
was written directly against the current codebase (not a target design):

| Document | Covers |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System shape, stack, monorepo layout, request flow, frontend state, testing |
| [`AUTHORIZATION.md`](./AUTHORIZATION.md) | Administrative & campaign roles, permissions, geographic scope, role hierarchy, privilege-escalation and self-escalation prevention |
| [`DATABASE.md`](./DATABASE.md) | All 36 Prisma models, relationships, and notable schema decisions |
| [`GEOGRAPHY.md`](./GEOGRAPHY.md) | State→District→LGA→Ward→PollingUnit hierarchy, real INEC data provenance, seeded vs. imported data, validation |
| [`CAMPAIGN.md`](./CAMPAIGN.md) | The Campaign Operations module: roles, permissions, API, frontend pages, resource reuse, disclosed gaps |
| [`SECURITY.md`](./SECURITY.md) | Implemented security controls vs. recommended future improvements |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Every command, port, environment variable, and what's not automated (no CI/CD, no Dockerfile for the apps) |

## Tests

```bash
pnpm test:api
```

18 Jest suites, 227 unit tests (mocked Prisma client, no test database) —
covering authentication, RBAC/permission/scope logic for both the
administrative and campaign domains (including explicit IDOR/privilege-
escalation attempts), membership ID sequencing, QR issue/resolve/revoke,
attendance/receipt duplicate-prevention, resource atomic-quantity guards,
document visibility, scope-filtered reporting, NIN field-level encryption
and the SUPER_ADMIN-only view rule, duplicate NIN/PVC detection, and
admin-messaging authorization (scope containment, IDOR/BOLA attempts).

## Known simplifications

Documented in full in `SECURITY.md`'s "Recommended future improvements"
section; the headline items:

- File storage (`apps/api/uploads/`, `apps/api/document-storage/`) is local disk, not object storage.
- The refresh token is kept in browser `localStorage`, not an httpOnly cookie.
- No 2FA, no CI/CD pipeline, no end-to-end test suite.
