import { Module } from '@nestjs/common';

/**
 * orchestration, templates, delivery log (TRD §4, §11).
 *
 * To build: MSG91 and FCM behind provider interfaces so both stay swappable by
 * configuration; template ids per language resolved from the worker's
 * preference; push-then-MSG91 fallback guarded by the engagement record;
 * delivery and reply webhooks made idempotent by provider message id — the
 * unique index on (channel, providerRef) is what enforces that, because
 * providers retry.
 */
@Module({})
export class NotificationsModule {}
