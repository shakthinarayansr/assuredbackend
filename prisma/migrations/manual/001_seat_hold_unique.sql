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
