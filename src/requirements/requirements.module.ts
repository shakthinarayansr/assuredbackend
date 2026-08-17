import { Module } from '@nestjs/common';

/**
 * shift requirements, shortlisting (TRD §4).
 *
 * To build: requirement CRUD for ops; candidate shortlisting by role, home
 * distance (haversine, GeoService), availability and reliability score; offer
 * distribution creating OFFERED bookings per seat. Several workers may hold an
 * OFFERED row on one seat — only one may occupy it, enforced by the partial
 * unique index in prisma/manual/001_seat_hold_unique.sql.
 */
@Module({})
export class RequirementsModule {}
