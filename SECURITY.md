# Security

This document distinguishes what is **implemented and verified in the
code** from what is **recommended but not yet built**. Every item in the
"Implemented" section was read directly from the source file cited next
to it.

## Implemented

### Authentication
- Passwords hashed with `bcryptjs`, **12 salt rounds**, both at user creation (`apps/api/src/users/users.service.ts:62`) and seeding (`prisma/seed.ts`).
- JWT access tokens (15 min default, `JWT_ACCESS_EXPIRES_IN`) and refresh tokens (7 days default, `JWT_REFRESH_EXPIRES_IN`), separately signed (`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`).
- Refresh tokens are **never stored raw** — only a SHA-256 hash (`hashToken()`, `auth.service.ts`) is persisted in `RefreshToken.tokenHash`; a leaked database dump does not yield usable refresh tokens.
- `JwtStrategy` re-checks the user's current `status` on every request (`jwt.strategy.ts`) — disabling an account invalidates its already-issued access tokens immediately, not just future logins.
- Failed logins are audited (`LOGIN_FAILED`, with the attempted email and IP) without leaking whether the account exists — the response is a generic "Invalid email or password."

### Rate limiting
- **Platform-wide**: `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])` registered as a global `APP_GUARD` in `app.module.ts` — every endpoint is limited to 120 requests/minute per client by default, not just auth endpoints.
- **Login specifically**: `POST /auth/login` additionally overrides this to a stricter 10 requests/minute via `@Throttle({ default: { limit: 10, ttl: 60_000 } })` (`auth.controller.ts`) — a tighter bound layered on top of the platform-wide default, not a replacement for it.

### Input validation
- Global `ValidationPipe` (`main.ts`) with `whitelist: true` (strips unknown properties), `forbidNonWhitelisted: true` (rejects a request body containing an unexpected property outright, rather than silently dropping it), `transform: true`.
- Password fields: `@MinLength(8)` (`create-user.dto.ts`, `login.dto.ts`). No additional complexity rule (no required uppercase/number/symbol) is enforced today.

### Transport / HTTP hardening
- `helmet()` applied globally (`main.ts`) — default header hardening (`X-Content-Type-Options`, `X-Frame-Options`, etc.), with `crossOriginResourcePolicy: false` explicitly relaxed (needed so uploaded files under `/uploads` can be fetched cross-origin by the separately-hosted frontend).
- CORS via `app.enableCors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true })` — an explicit allowlist from the `CORS_ORIGIN` env var. **Note**: if `CORS_ORIGIN` is unset, the fallback is `origin: true` (reflects any request origin) — safe only because it is documented as a required production variable; see `DEPLOYMENT.md`.
- All API routes are served under a global `/api` prefix (`app.setGlobalPrefix('api')`) — e.g. login is `POST /api/auth/login`, not `POST /auth/login`.

### Error handling
- `AllExceptionsFilter` (global, `main.ts`) catches every exception and returns only `{statusCode, message, timestamp}` — Prisma internals and stack traces are never sent to the client. Known Prisma error codes are mapped to sane HTTP statuses (P2002 unique violation → 409, P2025 not found → 404, other Prisma errors → 400). Only 500-level exceptions are logged server-side with a full stack trace.

### Authorization (see `AUTHORIZATION.md` for full detail)
- Server-side, four-layer enforcement (auth → role → permission → geographic scope) on every protected route, for both the administrative and campaign domains — the frontend nav filter is UX-only.
- Self-escalation blocked outright (`ForbiddenException`) before any other check runs, in both domains.
- Every authorization denial is written to the immutable `AuditLog` with a machine-readable reason code.
- Geographic scope containment resolves a target record's *actual* ancestry from the database rather than trusting client-supplied parent IDs — closes the obvious IDOR vector of claiming an in-scope parent for an out-of-scope child.

### Data-integrity race safety
- `@@unique([eventId, memberId])` on `Attendance` and `@@unique([distributionId, memberId])` on `DistributionReceipt` — duplicate check-ins/receipts are prevented by the database itself, not just an application-level check that could race.
- Resource quantity decrements use an atomic conditional `UPDATE` (confirmed in `ResourcesService`/`DistributionsService`) rather than a read-then-write pair, so concurrent allocation/usage requests can't oversell remaining stock.
- Raw SQL that Prisma's query builder can't express (a scope-filtered GROUP-BY, `member-scope-sql.ts`) uses `Prisma.sql` tagged templates — parameterized, never string-concatenated — so it carries no SQL-injection risk despite being raw SQL.

### Document access control
- Uploaded documents are stored in `document-storage/` (outside the public `/uploads` static directory mounted in `main.ts`) and served only through `GET /documents/:id/download`, which is authenticated and permission-checked.
- A restricted document (`restrictedToAdmins: true`) that a non-admin requests returns **404 Not Found**, not 403 Forbidden — deliberately, per the code comment in `documents.service.ts`: a 403 would itself confirm the document exists. Every download of a restricted document is separately audited (`RESTRICTED_DOCUMENT_DOWNLOADED`).

### QR verification
- QR tokens are opaque (`crypto.randomBytes(24).toString('base64url')`, `qr.service.ts`) — no member PII is encoded in the token itself; the token resolves to a member only via a server-side database lookup, so a captured/photographed QR code leaks nothing on its own beyond an opaque identifier.

## Recommended future improvements (not implemented)

These are genuine gaps, listed so they are visible rather than silently
assumed away. None of them is implemented today:

- **Refresh token storage**: the refresh token lives in browser `localStorage` (see `AUTHORIZATION.md`/`ARCHITECTURE.md`), which is readable by any script running on the page — an httpOnly, `SameSite` cookie would remove that exposure at the cost of needing CSRF protection instead.
- **No CSRF protection**: not needed today only because auth is bearer-token-based (no ambient cookie auth) rather than because CSRF was evaluated and mitigated — a future move to cookie-based auth would need this.
- **Password policy**: minimum length only (8 characters), no complexity requirement, no breach-list check (e.g. HaveIBeenPwned range check), no rotation policy.
- **No account lockout / backoff after repeated failed logins** beyond the generic 10 req/min IP-based throttle — a distributed low-and-slow credential-stuffing attempt against one account isn't specifically detected or blocked.
- **Login timing side-channel**: `bcrypt.compare` only runs when the email matches an existing user (`auth.service.ts`); a request for a non-existent email returns faster than one for an existing email with a wrong password, which is a (minor, hard-to-exploit-remotely) timing signal for account enumeration.
- **No 2FA/MFA** for any role, including `SUPER_ADMIN`.
- **Local disk storage** for both `document-storage/` and `uploads/` — no encryption at rest, no offsite/object storage (S3 or equivalent); a compromise of the host filesystem exposes uploaded files directly.
- **No Content-Security-Policy customization** beyond Helmet's defaults — no explicit CSP header tuned for this app's actual script/style/image sources.
- **`CORS_ORIGIN` fallback to `origin: true`** when unset is a real footgun if a production deploy forgets to set the env var — see `DEPLOYMENT.md` for the required-variables list.
- **No dependency/vulnerability scanning** configured in the repository (no `npm audit`/`Snyk`/Dependabot config found).
- **No security headers/audit test suite** — the 179 unit tests validate business logic (especially authorization), not response headers or injection resistance directly.

## What this document does not claim

- It does not claim penetration testing has been performed.
- It does not claim compliance with any specific standard (OWASP ASVS, SOC 2, GDPR, NDPR, etc.) — it only describes what the code does.
- The "Implemented" list above reflects the code at the time of writing; it is not a substitute for re-verifying before a security-sensitive release.
