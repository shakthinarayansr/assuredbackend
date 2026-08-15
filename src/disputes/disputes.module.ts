import { Module } from '@nestjs/common';

/**
 * intake and resolution (TRD §4).
 *
 * To build: worker raises a dispute against an attendance verdict, a no-show or
 * a score; ops queue and resolution. An overturned dispute must trigger a
 * reliability recompute rather than editing a score by hand.
 */
@Module({})
export class DisputesModule {}
