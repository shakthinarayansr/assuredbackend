import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';

import { AllExceptionsFilter } from './shared/errors/all-exceptions.filter';

/**
 * The single place the application is configured.
 *
 * `main.ts` and the e2e tests both call this, so a test can never pass against
 * a differently-configured app than the one that ships — which is exactly how
 * a double `/v1/v1` prefix survived a green test suite once already.
 *
 * URI versioning supplies the `/v1` prefix on its own. Do not also call
 * `setGlobalPrefix('v1')`: the two stack.
 */
export function configureApp(app: INestApplication): void {
  // Lets Redis, BullMQ and Prisma close cleanly on SIGTERM rather than being
  // killed mid-job when the platform recycles the container.
  app.enableShutdownHooks();

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Whitelist policy at the DTO boundary (TRD §13).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // A generic 500 is a defect, not an outcome (TRD §6.2).
  app.useGlobalFilters(app.get(AllExceptionsFilter));
}
