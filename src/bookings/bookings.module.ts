import { Module } from '@nestjs/common';

import { BookingsService } from './bookings.service';

/** Owns the booking state machine and the append-only event log (TRD §4). */
@Module({
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
