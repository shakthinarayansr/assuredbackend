import { Module } from '@nestjs/common';

/**
 * scheduling and responses (TRD §4, §10).
 *
 * To build: dispatch job unique per booking + type; escalation job guarded by
 * response state; inbound responses via push, WhatsApp reply webhook and SMS.
 * A confirmation is a nudge, not a gate — a worker who never responded may
 * still check in validly.
 */
@Module({})
export class ConfirmationsModule {}
