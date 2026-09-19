# Deployment / Local Setup

Every command, port, and variable below was read directly from
`package.json` (root, `apps/api`, `apps/web`), `docker-compose.yml`, and
`.env.example`. There is no CI/CD pipeline and no Dockerfile for the API
or web app in this repository — see "What's not here" at the end.

## Requirements

- Node.js ≥ 20 (`engines.node` in root `package.json`)
- pnpm (workspace uses `pnpm-workspace.yaml`: `apps/*`)
- Docker (for the bundled PostgreSQL container) — or any reachable PostgreSQL 16

## Ports

| Service | Port | Source |
|---|---|---|
| API | `4055` (`.env.example` `PORT`; code fallback is `4000` if unset) | `apps/api/src/main.ts` |
| Web | `3055` | `apps/web/package.json` (`next dev -p 3055` / `next start -p 3055`) |
| PostgreSQL | `5439` → container's `5432` | `docker-compose.yml`, bound to `127.0.0.1` only |

All API routes are additionally served under a global `/api` prefix (e.g.
`http://localhost:4055/api/auth/login`) — see `ARCHITECTURE.md`.

## Environment variables

From `.env.example` (root) — copy to `.env` before first run:

```bash
DATABASE_URL="postgresql://pdp:pdp_dev_password@localhost:5439/pdp_gombe_central?schema=public"
JWT_ACCESS_SECRET="change-me-access-secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="change-me-refresh-secret"
JWT_REFRESH_EXPIRES_IN="7d"
QR_SIGNING_SECRET="change-me-qr-secret"
NIN_ENCRYPTION_KEY="change-me-64-char-hex-aes-256-key"
NIN_HASH_SECRET="change-me-64-char-hex-hmac-secret"
PORT=4055
CORS_ORIGIN="http://localhost:3055"
SEED_SUPER_ADMIN_EMAIL="admin@pdpgombecentral.org"
SEED_SUPER_ADMIN_PASSWORD="ChangeMe123!"
NEXT_PUBLIC_API_URL="http://localhost:4055"
```

**Production checklist implied by the code, not just convention**:
- `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`QR_SIGNING_SECRET` must be changed from the placeholder values — nothing in the code refuses to boot with the placeholder, so this is not enforced, only expected.
- `NIN_ENCRYPTION_KEY`/`NIN_HASH_SECRET` (each 64 hex chars / 32 bytes, generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) must be set to unique per-environment values before any member NIN is registered — unlike the JWT/QR secrets, a missing or malformed value here throws at the point of use (`common/crypto/field-encryption.ts`) rather than silently degrading, and rotating either value after real NINs are stored will make existing encrypted/hashed values unreadable/unmatchable.
- `CORS_ORIGIN` must be set explicitly. If left unset, `main.ts` falls back to `origin: true` (reflects any request origin) — safe for local dev, a real risk if forgotten in production (see `SECURITY.md`).
- `SEED_SUPER_ADMIN_EMAIL`/`SEED_SUPER_ADMIN_PASSWORD` should be overridden before running the seed against a real environment — the defaults are checked into `.env.example` and are not a secret.

## Database

`docker-compose.yml` — a single `postgres:16-alpine` service:

```yaml
container_name: pdp_gombe_postgres
environment:
  POSTGRES_USER: pdp
  POSTGRES_PASSWORD: pdp_dev_password
  POSTGRES_DB: pdp_gombe_central
ports:
  - "127.0.0.1:5439:5432"
volumes:
  - pdp_pgdata:/var/lib/postgresql/data
restart: unless-stopped
```

Start it with `docker compose up -d`. Data persists in the named volume
`pdp_pgdata` across restarts.

## First-time setup

```bash
pnpm install                              # installs both apps/api and apps/web
cp .env.example .env                      # then edit secrets/CORS_ORIGIN for your environment
docker compose up -d                      # starts PostgreSQL on port 5439
pnpm --filter api prisma:generate         # generate the Prisma client
pnpm --filter api prisma:migrate          # apply all 12 migrations (dev workflow)
pnpm --filter api prisma:seed             # seed State/Districts/LGAs, SUPER_ADMIN, role permissions, the one Campaign
pnpm --filter api import:inec-gombe       # import real Wards + Polling Units from prisma/data/inec/ (see GEOGRAPHY.md)
pnpm --filter api validate:org-hierarchy  # sanity-check the imported hierarchy (optional but recommended)
```

## Running in development

```bash
pnpm dev:api    # -> pnpm --filter api start:dev  (NestJS, --watch, port 4055)
pnpm dev:web    # -> pnpm --filter web dev         (Next.js, port 3055)
```

Run both in separate terminals — there is no single combined dev script
in root `package.json`.

## Building / running in production mode

```bash
pnpm build:api  # -> pnpm --filter api build   (nest build -> apps/api/dist)
pnpm build:web  # -> pnpm --filter web build    (next build)

pnpm --filter api start:prod   # node dist/main   (must be built first)
pnpm --filter web start        # next start -p 3055 (must be built first)
```

For a production database, use `prisma:deploy` (`prisma migrate deploy`)
rather than `prisma:migrate` (`prisma migrate dev`) — the latter can
prompt interactively and is meant for local development only.

## All package.json scripts (exact, as found)

**Root**:
```
dev:api, dev:web, build:api, build:web, lint:api, lint:web, test:api,
db:migrate, db:seed, db:studio
```
(each a thin `pnpm --filter <app> <script>` wrapper)

**`apps/api`**:
```
build           nest build
start           nest start
start:dev       nest start --watch
start:prod      node dist/main
lint            eslint "{src,test}/**/*.ts" --fix
test            jest
test:watch      jest --watch
test:cov        jest --coverage
prisma:generate prisma generate
prisma:migrate  prisma migrate dev
prisma:deploy   prisma migrate deploy
prisma:seed     ts-node prisma/seed.ts
prisma:studio   prisma studio
import:inec-gombe       ts-node prisma/scripts/import-inec-gombe.ts
validate:org-hierarchy  ts-node prisma/scripts/validate-org-hierarchy.ts
```

**`apps/web`**:
```
dev     next dev -p 3055
build   next build
start   next start -p 3055
lint    next lint
```

## File storage on disk

Two separate directories, both git-ignored, both created at runtime (not
committed):
- `apps/api/uploads/` — served as public static assets at `/uploads` (`app.useStaticAssets`, `main.ts`). Used for content that's fine to be directly linkable.
- `apps/api/document-storage/` — **not** statically served; reachable only through the authenticated `GET /api/documents/:id/download` endpoint (see `SECURITY.md`).

Neither is backed by object storage (S3 or equivalent) today — see
`SECURITY.md`'s recommended-improvements list.

## Tests

```bash
pnpm test:api   # -> pnpm --filter api test  (Jest, 15 suites, 179 tests)
```

All tests are unit-level against a mocked Prisma client — there is no
test database and no end-to-end test suite (see `ARCHITECTURE.md`).

## What's not here

- **No CI/CD**: no `.github/workflows` directory, no other CI config found anywhere in the repository.
- **No Dockerfile** for the API or the web app — `docker-compose.yml` only runs PostgreSQL. Deploying the API/web means running the `build`/`start` commands above directly on a host (or writing your own container image — not provided).
- **No process manager config** (no PM2 ecosystem file, no systemd unit) — `start:prod`/`start` are meant to be run under whatever process supervision the deployment target provides.
