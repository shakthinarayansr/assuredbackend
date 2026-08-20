# Backend Handoff

**Audience:** engineering co-founder picking up this repo.
**Status as of 19 Aug 2026** — everything below was verified by running it, not inferred.

This document is canonical. If it disagrees with anything else, fix this file.

---

## 1. Read this first

The platform's product claim is a *reliability signal* for shift work. That makes the backend
the authority on truth, so the codebase is disproportionately concerned with three properties:
**validation, idempotency and auditability**. Most of the unusual-looking decisions in here
exist to defend one of those.

Two consequences worth internalising before you write anything:

- **The client is never trusted.** A phone tells us where it thinks it is and what time it
  thinks it is. Both are attacker-controlled. Every eligibility decision is recomputed
  server-side from the submitted evidence.
- **Duplicate delivery is certain.** Workers queue actions offline and retry. Duplicate state
  must be impossible, and that is enforced by database constraints rather than by application
  logic that can be forgotten.

The Backend TRD v0.1 is the reference for *why*. It is **not committed to this repo** — drop it
in `docs/` so the `§` references throughout the code resolve.

---

## 2. Where things stand

| | |
|---|---|
| Modules with real logic | 10 |
| Module shells (docblock only, no code) | 7 |
| Live HTTP endpoints | 6 + 3 infra |
| Tests | 17 unit, 22 e2e — all passing |
| Database | 21 tables migrated, 24 config keys + 4 flags seeded |
| Lint / build | clean, `--max-warnings 0`, TypeScript strict |

Verified by running: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`,
`npx prisma migrate deploy`, `npm run db:seed`, plus a manual curl walk-through of the full
sign-in and profile flow.

**A worker can sign in and build a profile. Nothing else is reachable over HTTP yet.**

---

## 3. Getting it running on your machine

You need **Node 24** and a container runtime. Node is pinned in `.nvmrc`.

```bash
nvm use                          # Node 24.19.0
cp .env.example .env             # fill in secrets; thresholds do NOT belong here
npm install
docker compose up -d             # Postgres 17 + Valkey on 5432 / 6379
npx prisma migrate deploy
npm run db:seed
npm run start:dev
```

- API: `http://localhost:3000/v1`
- OpenAPI: `http://localhost:3000/docs` (JSON at `/docs/openapi.json`)

### A note on `scripts/dev-services.sh`

That script exists because the machine this was built on has **no container runtime and no
Homebrew**, so Postgres and Redis were installed as userspace binaries under `~/.local`. The
script starts and stops those specific binaries.

**It will not work on your machine.** Use `docker compose up -d` instead — the compose file is
the reference for CI and production, and the script is a local workaround. If you also cannot
run Docker, the script's header documents exactly how the userspace install was done.

Redis 7.4.2 was used locally in place of the Valkey named in the compose file. They are
protocol-compatible and BullMQ cannot tell them apart.

---

## 4. Architecture

### Request lifecycle

```
request
  → JwtAuthGuard        (global) verifies bearer token, attaches principal
  → RolesGuard          (global) rejects unless @Public() or the role matches
  → IdempotencyInterceptor (global) claims/replays if @Idempotent()
  → ValidationPipe      whitelist: unknown fields are rejected, not ignored
  → controller → service → Prisma
  → AllExceptionsFilter maps everything to { code, message, requestId }
```

All three globals are registered in code, not by convention:
guards in `src/auth/auth.module.ts`, interceptor in `src/shared/shared.module.ts`.

### App configuration

`src/bootstrap.ts` holds the single `configureApp()` used by both `main.ts` and the e2e suite.
**Do not configure the app anywhere else.** A test that builds its own bootstrap validates an
application that does not ship — see §8.

### Module map

| Module | State | What is there |
|---|---|---|
| `shared` | built | Idempotency, geo (haversine), time arbitration, error contract, guards |
| `auth` | built | OTP sign-in, sessions, token rotation, rate limits, global guards |
| `workers` | built | Profile read + step-wise update, completeness rule |
| `bookings` | built | State machine over 12 statuses, transition writer, overlap check |
| `attendance` | built | Nine-stage validation pipeline + commit path (no HTTP entry yet) |
| `config` | built | 24 thresholds + 4 flags, DB-backed, Redis-cached, audited |
| `queue` | built | 7 queues, 11 job names, stable job ids — **no processors** |
| `media` | built | Presigned R2 uploads |
| `prisma` | built | 20 models, 16 enums |
| `health` | built | Liveness + readiness |
| `companies` | shell | ops-managed CRUD |
| `requirements` | shell | shift requirements, shortlisting |
| `confirmations` | shell | scheduling and responses |
| `reliability` | shell | scoring, snapshots |
| `notifications` | shell | MSG91 + FCM orchestration |
| `disputes` | shell | intake and resolution |
| `ops` | shell | the entire console |

A shell is a `*.module.ts` carrying a docblock of what belongs in it. No controllers, no
services, no DTOs.

---

## 5. Invariants — do not break these

These are the things that are expensive or impossible to repair after the fact.

1. **Never trust a client verdict.** The client's own geofence opinion is stored as a flag when
   it disagrees with the server; it never decides anything.
2. **Every write is idempotent.** Mark write endpoints `@Idempotent()`. The unique constraint,
   not application logic, is what makes duplicates safe.
3. **State transitions are append-only.** A booking status without a matching `BookingEvent` is
   a corrupt audit trail. Only `BookingsService.transition()` writes booking state.
4. **Server time is the only trusted clock.** Device time is evidence. `TimeArbitrationService`
   derives the real capture instant from monotonic uptime; that is what makes offline check-in
   safe.
5. **No threshold is a constant.** If you are about to write a number, it belongs in
   `src/config/config-keys.ts` as a seed default and in the `config` table as truth. An env var
   requires a deploy, which defeats the purpose.
6. **Verdict and flags are separate.** An accepted check-in carrying three flags is a real
   outcome that ops needs to see, not a contradiction.

### The seat invariant

"One seat, one worker" is enforced by a **partial unique index**, not by application code:

```sql
CREATE UNIQUE INDEX bookings_seat_hold_unique
  ON bookings ("requirementId", "seatIndex")
  WHERE status IN ('ACCEPTED','CONFIRMED','CHECKED_IN','CHECKED_OUT','COMPLETED','NO_SHOW');
```

It must stay **partial**: several workers may hold `OFFERED` rows on one seat — that is how offer
distribution works — but at most one may occupy it. Two concurrent accepts produce one booking
and one `SEAT_FILLED`. The source lives in `prisma/manual/001_seat_hold_unique.sql`; keep it
**outside** `prisma/migrations/` (see §8).

**This index has never been exercised by a test.** Writing that test is the first thing on the
roadmap for a reason.

---

## 6. What is done

| Area | Where |
|---|---|
| Error contract, 20 stable machine codes | `src/shared/errors/` |
| Idempotency: claim / replay / key-reuse conflict | `src/shared/idempotency/` |
| Time arbitration + 5 tests | `src/shared/time/` |
| Haversine geo + implied-speed signal | `src/shared/geo/geo.service.ts` |
| Booking state machine + 7 tests | `src/bookings/booking-state-machine.ts` |
| Transition writer (projection + event in one transaction) | `src/bookings/bookings.service.ts` |
| Attendance pipeline, 9 stages, accumulating verdicts | `src/attendance/pipeline/` |
| Config service: DB-backed, Redis-cached, audited | `src/config/config.service.ts` |
| OTP sign-in, rotating device-bound sessions | `src/auth/` |
| Worker profile | `src/workers/` |
| Presigned R2 uploads | `src/media/media.service.ts` |
| Full data model, 20 models | `prisma/schema.prisma` |
| CI: lint, migrate, unit, e2e, build against real services | `.github/workflows/ci.yml` |

### Live endpoints

```
GET   /v1/healthz                                        public
GET   /v1/readyz                                         public
GET   /v1/config                                         worker | ops
POST  /v1/auth/otp/request   { phone }                   public, rate-limited
POST  /v1/auth/otp/verify    { phone, code, deviceId }   public, creates the worker
POST  /v1/auth/refresh       { refreshToken, deviceId }  public, rotates
POST  /v1/auth/logout                                    worker, @Idempotent()
GET   /v1/workers/me                                     worker
PATCH /v1/workers/me                                     worker, @Idempotent()
```

### Auth behaviour you should know about

- OTP codes are stored as a **peppered HMAC**, not a plain digest. Six digits is a million
  possibilities; an unkeyed hash of a stolen table is reversible in seconds.
- Refresh tokens are opaque, hashed at rest, device-bound and rotating. Presenting an
  already-rotated token **revokes the entire family** — a replay means the token leaked.
- **A worker has one live device at a time.** Signing in on a second handset revokes the first,
  which learns about it via `SESSION_SUPERSEDED` on its next refresh. This is TRD BE-AUTH-04,
  but it is product-visible and worth confirming with the founders for partners who switch
  phones.
- `LoggingOtpSender` writes codes to the log because MSG91 has no credentials yet. It **throws**
  if it finds itself in production rather than silently doing nothing, which would lock every
  worker out with no visible failure.

---

## 7. Roadmap — what is pending

Ordered by dependency. Each phase is shippable on its own.

### Phase 1 — Prove the seat invariant *(small, do it first)*

Fire concurrent `transition()` calls at one seat, assert exactly one booking survives and the
loser gets `SEAT_FILLED`. **Needs no new production code** — `bookings.service.ts:97` already
translates the Postgres unique violation. Everything built afterwards sits on top of this
invariant, so test it before, not after.

### Phase 2 — Offers and the accept flow

Build out `requirements`: shortlist candidates, distribute offers to several workers per seat,
accept and decline, offer expiry. This is what turns a profile into work, and it gives the
concurrency test a real endpoint to hit rather than a service call.

Also needs `companies` (ops-managed businesses and locations) since a requirement hangs off a
location with a geofence centre.

### Phase 3 — Check-in and check-out

Wire HTTP entry points into the attendance pipeline, which is written but has never run against
a real submission. Two stage bodies are still `TODO`:

- Media: HEAD the object in R2 to confirm existence, size and type.
- Face verification: blocked on **BT-2** (provider choice).

### Phase 4 — Background jobs

Seven queues and eleven job names are declared; **zero processors are written**. The
correctness-critical one is **no-show detection**: it must fire once per booking, must not fire
for a booking that checked in late but validly, and must survive the worker process dying —
hence a per-booking delayed job keyed on booking id, plus a periodic reconciliation sweep that
catches whatever the queue lost.

### Phase 5 — Confirmations, reliability, notifications

Confirmation dispatch and escalation; reliability recompute on terminal booking events
(versioned snapshots, formula per **BT-1**); MSG91 and FCM behind the provider interfaces.

### Phase 6 — Ops console and disputes

Ops authentication is separate: email, password and TOTP, none of it built. Only the `worker`
role can authenticate today. Then the console surface — worker vetting, requirement CRUD, live
attendance board, replacement triggers, dispute queue, config editing, metrics.

### Cross-cutting, not optional

The **remaining TRD §15 concurrency tests**: duplicate check-in submission yields one attendance
record; offline check-in submitted hours late lands at capture time; no-show fires exactly once.
Write each alongside the feature it covers. These protect the reliability data from
irrecoverable corruption.

The **OpenAPI contract check** in CI is commented out at the bottom of the workflow. Turn it on
once the spec baseline is committed, so a change that breaks the generated Flutter client fails
the build.

---

## 8. Traps already hit — do not pay for these twice

Each of these cost real debugging time.

**`prisma/migrations/` treats every subdirectory as a migration.** A folder of hand-written SQL
in there fails the whole migration system with `P3015`. Manual SQL lives in `prisma/manual/`.

**A global prefix and URI versioning stack.** `setGlobalPrefix('v1')` plus
`enableVersioning({ type: URI, defaultVersion: '1' })` mounts everything at `/v1/v1/...`. URI
versioning supplies the prefix on its own.

**A test that builds its own bootstrap proves nothing.** The prefix bug above shipped green
because the e2e suite configured its own app. Both entry points now call `configureApp()`, and a
test asserts nothing answers at the doubled path.

**Decorators without a registered global do nothing.** `@Roles(...)` and `@Idempotent()` were
both decorative for a while — the guard and interceptor existed but were never registered as
`APP_GUARD` / `APP_INTERCEPTOR`. If you add a new cross-cutting decorator, register it and write
a test that proves it bites.

**`reflect-metadata` load order breaks implicit conversion.** Env validation silently rejected a
valid `PORT` when a test imported the module before `reflect-metadata` loaded. Prefer explicit
`@Type(() => Number)` over relying on decorator metadata.

**A bare factory provider is never closed.** The Redis client was a `useFactory` returning an
ioredis instance; Nest only calls lifecycle hooks on providers that implement them, so the
socket leaked and the process would not exit. It is a class with `onModuleDestroy` now.

**Swagger on Fastify needs `@fastify/static`.** Without it the app refuses to boot at all.

---

## 9. Conventions

**Adding an endpoint.** Controller method → `@Roles(...)` (or `@Public()`, rarely) → `@Idempotent()`
if it writes → DTO with class-validator on every field → service does the work → ownership
checked in the service, never from a request body field. Use `me` in paths rather than an id: a
worker may only ever address themselves.

**Errors.** Throw `AppException(ErrorCode.X, message, details)`. Never a bare `HttpException`.
A generic 500 reaching the client is a defect in the error-code list, not an acceptable outcome.
Codes live in `src/shared/errors/error-codes.ts` with their HTTP status alongside; adding one is
a contract change, because the Flutter client switches on it.

**Config.** Add the key to `src/config/config-keys.ts` with a seed default, read it via
`PlatformConfigService`. Never `process.env` for an operational threshold.

**Money.** Integer paise. No floats, anywhere.

**Tests.** Unit tests for pure logic next to the source as `*.spec.ts`. E2E in `test/`, and they
require Postgres and Redis running. Every e2e suite must call `configureApp()`.

**Logging.** Structured pino. Phone numbers, names and coordinates never reach logs or Sentry —
the redaction list is in `src/app.module.ts`, and the manual walk-through confirmed the test
phone number appears zero times in output.

---

## 10. Decisions that need a founder answer

These are carried in code as defaults, deliberately visible.

| # | Question | How the code holds it | When it must be answered |
|---|---|---|---|
| BT-1 | Reliability formula and version scheme | Snapshots versioned from day one | Post-pilot |
| BT-2 | Face verification provider and threshold | Stage flags only, never auto-rejects | **Before attendance ships** |
| BT-3 | Time-skew tolerance | Seeded permissive at 5 min, flags not rejects | **Before attendance ships** |
| BT-4 | Attendance media retention window | Seeded 90 days | Needs legal input |
| BT-5 | Postgres 17 vs 18 | 17 in compose and CI | Whenever the managed tier is chosen |
| BT-6 | Score visibility, browse, documents | All four flags seeded off | Before pilot |
| BT-7 | OTP rate limits | Seeded conservative, config-editable | Tune against MSG91 cost |

Two more that are not in the TRD's list but need a decision:

- **Single-device sessions.** See §6. Confirm this is the intended product behaviour.
- **MSG91 credentials.** Nothing can be sent to a real worker until these exist.

---

## 11. Known gaps in what is built

Being explicit so you do not assume coverage that is not there.

- The attendance pipeline has **never run against a real submission** — no HTTP entry point.
- `bookings.service.ts` has a transition writer and overlap check, but **no accept path** —
  there is no way to create a booking over HTTP.
- **No BullMQ processor exists.** Jobs are declared only.
- **Ops cannot authenticate at all.**
- The e2e suite covers auth and profile thoroughly and everything else not at all.
- `npm audit` reports vulnerabilities in the dependency tree; nobody has triaged them.
- Install scripts were blocked by npm policy during setup (`fsevents`, Prisma's). Prisma works
  because `prisma generate` is run explicitly, but if watch mode misbehaves, run
  `npm install-scripts approve prisma @prisma/client @prisma/engines fsevents`.
