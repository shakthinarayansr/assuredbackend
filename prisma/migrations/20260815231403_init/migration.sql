-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('PENDING_VETTING', 'VETTED', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('AADHAAR', 'PAN', 'BANK_PROOF', 'POLICE_VERIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('DRAFT', 'OPEN', 'FILLED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'NO_SHOW', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_OPS', 'REPLACED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('WORKER', 'OPS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AttendanceKind" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "AttendanceVerdict" AS ENUM ('ACCEPTED', 'REJECTED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "ConfirmationType" AS ENUM ('DAY_BEFORE', 'MORNING_OF', 'PRE_SHIFT');

-- CreateEnum
CREATE TYPE "ConfirmationChannel" AS ENUM ('PUSH', 'WHATSAPP', 'SMS', 'IVR');

-- CreateEnum
CREATE TYPE "ConfirmationResponse" AS ENUM ('CONFIRMED', 'DECLINED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeTarget" AS ENUM ('ATTENDANCE', 'NO_SHOW', 'RELIABILITY_SCORE', 'PAY', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeState" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED_UPHELD', 'RESOLVED_OVERTURNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OpsRole" AS ENUM ('ADMIN', 'OPS', 'READ_ONLY');

-- CreateTable
CREATE TABLE "workers" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "status" "WorkerStatus" NOT NULL DEFAULT 'PENDING_VETTING',
    "languagePref" TEXT NOT NULL DEFAULT 'en',
    "profilePhotoKey" TEXT,
    "homeLat" DOUBLE PRECISION,
    "homeLng" DOUBLE PRECISION,
    "homeAreaLabel" TEXT,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "travelDistanceKm" INTEGER NOT NULL DEFAULT 10,
    "availability" JSONB,
    "cachedScore" INTEGER,
    "cachedScoreVersion" TEXT,
    "vettedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_documents" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "pushToken" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "replacedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "role" "OpsRole" NOT NULL DEFAULT 'OPS',
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_locations" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geofenceRadiusM" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "headcount" INTEGER NOT NULL,
    "payPaise" INTEGER NOT NULL,
    "highValue" BOOLEAN NOT NULL DEFAULT false,
    "status" "RequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'OFFERED',
    "offerExpiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "replacesBookingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "reason" TEXT,
    "evidenceRef" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "kind" "AttendanceKind" NOT NULL,
    "photoObjectKey" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "code" TEXT,
    "deviceWallClockAt" TIMESTAMP(3),
    "deviceUptimeMs" BIGINT,
    "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derivedCaptureAt" TIMESTAMP(3),
    "verdict" "AttendanceVerdict" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "distanceM" DOUBLE PRECISION,
    "faceConfidence" DOUBLE PRECISION,
    "integrityPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confirmations" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "type" "ConfirmationType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "channel" "ConfirmationChannel",
    "sentAt" TIMESTAMP(3),
    "response" "ConfirmationResponse" NOT NULL DEFAULT 'NO_RESPONSE',
    "respondedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reliability_scores" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "reason" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reliability_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateId" TEXT NOT NULL,
    "payload" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "providerRef" TEXT,
    "failureCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "engagedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "bookingId" UUID,
    "target" "DisputeTarget" NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "DisputeState" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedBy" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "config_audit" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "actorId" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "inFlight" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "workers_phone_key" ON "workers"("phone");

-- CreateIndex
CREATE INDEX "workers_status_idx" ON "workers"("status");

-- CreateIndex
CREATE INDEX "worker_documents_workerId_type_idx" ON "worker_documents"("workerId", "type");

-- CreateIndex
CREATE INDEX "devices_pushToken_idx" ON "devices"("pushToken");

-- CreateIndex
CREATE UNIQUE INDEX "devices_workerId_deviceId_key" ON "devices"("workerId", "deviceId");

-- CreateIndex
CREATE INDEX "otp_challenges_phone_createdAt_idx" ON "otp_challenges"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_workerId_familyId_idx" ON "refresh_tokens"("workerId", "familyId");

-- CreateIndex
CREATE UNIQUE INDEX "ops_users_email_key" ON "ops_users"("email");

-- CreateIndex
CREATE INDEX "company_locations_companyId_idx" ON "company_locations"("companyId");

-- CreateIndex
CREATE INDEX "requirements_status_startsAt_idx" ON "requirements"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_replacesBookingId_key" ON "bookings"("replacesBookingId");

-- CreateIndex
CREATE INDEX "bookings_requirementId_seatIndex_idx" ON "bookings"("requirementId", "seatIndex");

-- CreateIndex
CREATE INDEX "bookings_workerId_status_idx" ON "bookings"("workerId", "status");

-- CreateIndex
CREATE INDEX "bookings_status_updatedAt_idx" ON "bookings"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "booking_events_bookingId_occurredAt_idx" ON "booking_events"("bookingId", "occurredAt");

-- CreateIndex
CREATE INDEX "attendance_verdict_createdAt_idx" ON "attendance"("verdict", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_bookingId_kind_key" ON "attendance"("bookingId", "kind");

-- CreateIndex
CREATE INDEX "confirmations_scheduledAt_response_idx" ON "confirmations"("scheduledAt", "response");

-- CreateIndex
CREATE UNIQUE INDEX "confirmations_bookingId_type_key" ON "confirmations"("bookingId", "type");

-- CreateIndex
CREATE INDEX "reliability_scores_workerId_computedAt_idx" ON "reliability_scores"("workerId", "computedAt");

-- CreateIndex
CREATE INDEX "notifications_workerId_createdAt_idx" ON "notifications"("workerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_channel_providerRef_key" ON "notifications"("channel", "providerRef");

-- CreateIndex
CREATE INDEX "disputes_state_createdAt_idx" ON "disputes"("state", "createdAt");

-- CreateIndex
CREATE INDEX "config_audit_key_changedAt_idx" ON "config_audit"("key", "changedAt");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- AddForeignKey
ALTER TABLE "worker_documents" ADD CONSTRAINT "worker_documents_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "company_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_replacesBookingId_fkey" FOREIGN KEY ("replacesBookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reliability_scores" ADD CONSTRAINT "reliability_scores_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seat contention invariant (Backend TRD §15: "concurrency tests are not optional").
--
-- Several workers may simultaneously hold an OFFERED booking for the same seat —
-- that is how offer distribution works. At most one may ever OCCUPY the seat.
-- A plain composite unique cannot say that; a partial unique index can, and it is
-- the database, not application logic, that makes concurrent acceptance safe.
--
-- Paste this into the generated migration after `prisma migrate dev --create-only`.

CREATE UNIQUE INDEX IF NOT EXISTS "bookings_seat_hold_unique"
  ON "bookings" ("requirementId", "seatIndex")
  WHERE "status" IN (
    'ACCEPTED',
    'CONFIRMED',
    'CHECKED_IN',
    'CHECKED_OUT',
    'COMPLETED',
    'NO_SHOW'
  );

-- Two concurrent accepts on one seat: the loser gets a unique-violation, which
-- the bookings service translates into SEAT_FILLED (23505 -> error code).
