# AssuredGig Backend

Platform services for the AssuredGig / AssuredCrew worker app. NestJS (Fastify) ·
TypeScript strict · Prisma · PostgreSQL 17 · Redis/Valkey + BullMQ.

Built to **Backend TRD v0.1** (`assuredgig_backend_trd_mvp.md` — not yet
committed to this repo; drop it in `docs/` so the section references below
resolve). The TRD is the reference for *why* anything here is shaped the way
it is.

## Prerequisites

- **Node 24 LTS** — pinned in [.nvmrc](.nvmrc) (v24.19.0). With nvm: `nvm use`.
- **Docker** — not yet installed; needed for local Postgres and Valkey, and so
  for migrations, seeding and e2e tests.

## Getting started

```bash
cp .env.example .env        # fill in secrets; thresholds do NOT go here
npm install
docker compose up -d        # Postgres 17 + Valkey on 5432 / 6379
npx prisma migrate dev      # first run creates the initial migration
npm run db:seed             # writes config + feature-flag defaults
npm run start:dev
```

- API: `http://localhost:3000/v1`
- OpenAPI: `http://localhost:3000/docs` (JSON at `/docs/openapi.json`)
- Health: `/v1/healthz`, `/v1/readyz`

### One manual step after the first migration

`prisma migrate dev --create-only`, then paste
[`prisma/migrations/manual/001_seat_hold_unique.sql`](prisma/migrations/manual/001_seat_hold_unique.sql)
into the generated migration before applying it. It creates the **partial**
unique index that makes "one seat, one worker" a database invariant — Prisma
cannot express a partial index in schema, and without it concurrent acceptance
of the same seat can produce two bookings.

## Layout

```
src/
  shared/          idempotency · geo · time arbitration · errors · guards
  config/          thresholds and flags as data (§12)
  queue/           BullMQ queues, Redis client, stable job ids (§10)
  prisma/          PrismaService
  auth/            otp, sessions, tokens, device binding (§7)
  workers/ companies/ requirements/
  bookings/        state machine + append-only event log (§5)
  attendance/      the validation pipeline (§8)
  confirmations/ reliability/ notifications/ disputes/ media/ ops/
  health/
prisma/            schema, seed, manual migration SQL
test/              e2e
```

Modules talk through services, never by reaching into each other's Prisma
models. `bookings` is the only module permitted to write booking state.

## What is implemented vs. scaffolded

**Implemented** — the correctness spine, the parts that are expensive to retrofit:

| Area | File |
|---|---|
| Error contract, stable machine codes | [src/shared/errors/](src/shared/errors/) |
| Idempotency (claim / replay / key-reuse) | [src/shared/idempotency/](src/shared/idempotency/) |
| Time arbitration + tests | [src/shared/time/](src/shared/time/) |
| Haversine geo + implied-speed signal | [src/shared/geo/geo.service.ts](src/shared/geo/geo.service.ts) |
| Booking state machine + exhaustive tests | [src/bookings/booking-state-machine.ts](src/bookings/booking-state-machine.ts) |
| Transition writer (projection + event, one transaction) | [src/bookings/bookings.service.ts](src/bookings/bookings.service.ts) |
| Attendance pipeline: 9 stages, accumulating verdicts | [src/attendance/pipeline/](src/attendance/pipeline/) |
| Config service: DB-backed, Redis-cached, audited | [src/config/config.service.ts](src/config/config.service.ts) |
| Presigned R2 uploads | [src/media/media.service.ts](src/media/media.service.ts) |
| Full data model | [prisma/schema.prisma](prisma/schema.prisma) |

**Scaffolded** — module shells carrying a docblock of what belongs in them:
`auth`, `workers`, `companies`, `requirements`, `confirmations`, `reliability`,
`notifications`, `disputes`, `ops`. No controllers or DTOs yet, and no BullMQ
processors — the queues and job ids are declared in
[src/queue/queue.constants.ts](src/queue/queue.constants.ts), the processors are not written.

Two pipeline stages have `TODO` bodies that need an external decision before they
can be finished: media HEAD-check against R2, and face verification (**BT-2** —
provider choice, which also decides whether biometric data leaves the country).

## Invariants worth not breaking

1. **Never trust a client verdict.** The client's geofence opinion is stored as
   a flag when it disagrees with the server; it never decides anything.
2. **Every write is idempotent.** Mark write endpoints `@Idempotent()`; the
   unique constraint, not application logic, is what makes duplicates safe.
3. **State transitions are append-only.** A status without a matching
   `BookingEvent` is a corrupt audit trail. Only `BookingsService.transition()`
   writes booking state.
4. **Server time is the only trusted clock.** Device time is evidence.
5. **No threshold is a constant.** If you are about to write a number, it
   belongs in [src/config/config-keys.ts](src/config/config-keys.ts) as a seed
   default and in the `config` table as truth.
6. **Verdict and flags are separate.** Accepted-with-three-flags is a real
   outcome, not a contradiction.

## Tests

```bash
npm test              # unit
npm run test:e2e      # requires Postgres and Redis up
```

The concurrency tests named in TRD §15 — one seat under concurrent acceptance,
duplicate check-in submission, offline check-in landing at capture time, no-show
firing exactly once — are **not yet written**. They are the tests that protect
the reliability data from irrecoverable corruption; write them alongside the
endpoints they cover.

## Open technical items carried into the code

| # | Item | Where it surfaces |
|---|---|---|
| BT-1 | Reliability formula | `RELIABILITY_FORMULA_VERSION` — versioned from day one |
| BT-2 | Face verification provider | `FaceVerificationStage`, flag-only today |
| BT-3 | Time-skew tolerance | `TIME_SKEW_TOLERANCE_MS`, seeded permissive at 5 min |
| BT-4 | Media retention window | `ATTENDANCE_MEDIA_RETENTION_DAYS`, seeded 90 |
| BT-5 | Postgres 17 vs 18 | `docker-compose.yml`, CI service image |
| BT-6 | Visibility / browse / documents flags | `FLAG_DEFAULTS`, all off |
| BT-7 | OTP rate limits | `OTP_MAX_*` config keys |
