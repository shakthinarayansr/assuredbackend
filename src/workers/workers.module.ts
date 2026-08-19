import { Module } from '@nestjs/common';

import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

/**
 * profile, availability, documents, vetting (TRD §4).
 *
 * Documents remain unbuilt — they exist only under Register #4 branch B, gated
 * by the `flags.document_upload` feature flag. Vetting is an ops action and
 * belongs to the ops console.
 */
@Module({
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
