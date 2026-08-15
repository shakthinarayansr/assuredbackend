import { Global, Module } from '@nestjs/common';

import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { GeoService } from './geo/geo.service';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyService } from './idempotency/idempotency.service';
import { RolesGuard } from './auth/roles.guard';
import { TimeArbitrationService } from './time/time-arbitration.service';

/**
 * Cross-cutting primitives: idempotency, geo, time arbitration, errors, guards
 * (TRD §4, `shared`). Nothing here reaches into a domain module.
 */
@Global()
@Module({
  providers: [
    AllExceptionsFilter,
    GeoService,
    IdempotencyService,
    IdempotencyInterceptor,
    RolesGuard,
    TimeArbitrationService,
  ],
  exports: [
    AllExceptionsFilter,
    GeoService,
    IdempotencyService,
    IdempotencyInterceptor,
    RolesGuard,
    TimeArbitrationService,
  ],
})
export class SharedModule {}
