import { ActorType, BookingStatus } from '@prisma/client';

import { AppException } from '../shared/errors/app.exception';
import { ErrorCode } from '../shared/errors/error-codes';

/**
 * The booking lifecycle (TRD §5, C-04). Current status is a projection of the
 * event log; this table says which projections may follow which. Anything not
 * listed is illegal, and every illegal transition must be rejected — that is a
 * unit-test obligation, not an aspiration (TRD §15).
 */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  OFFERED: [
    BookingStatus.ACCEPTED,
    BookingStatus.DECLINED,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED_BY_OPS,
  ],
  ACCEPTED: [
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_IN,
    BookingStatus.NO_SHOW,
    BookingStatus.CANCELLED_BY_WORKER,
    BookingStatus.CANCELLED_BY_OPS,
    BookingStatus.REPLACED,
  ],
  CONFIRMED: [
    BookingStatus.CHECKED_IN,
    BookingStatus.NO_SHOW,
    BookingStatus.CANCELLED_BY_WORKER,
    BookingStatus.CANCELLED_BY_OPS,
    BookingStatus.REPLACED,
  ],
  CHECKED_IN: [BookingStatus.CHECKED_OUT, BookingStatus.CANCELLED_BY_OPS],
  CHECKED_OUT: [BookingStatus.COMPLETED],

  // Terminal.
  COMPLETED: [],
  DECLINED: [],
  EXPIRED: [],
  NO_SHOW: [],
  CANCELLED_BY_WORKER: [],
  CANCELLED_BY_OPS: [],
  REPLACED: [],
};

/** Statuses that occupy the seat — mirrors the partial unique index in SQL. */
export const SEAT_HOLDING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
  BookingStatus.CHECKED_OUT,
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
];

/** Statuses that end the booking and therefore trigger a reliability recompute. */
export const TERMINAL_STATUSES: readonly BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.DECLINED,
  BookingStatus.EXPIRED,
  BookingStatus.NO_SHOW,
  BookingStatus.CANCELLED_BY_WORKER,
  BookingStatus.CANCELLED_BY_OPS,
  BookingStatus.REPLACED,
];

export const isTerminal = (status: BookingStatus): boolean => TERMINAL_STATUSES.includes(status);

export const canTransition = (from: BookingStatus, to: BookingStatus): boolean =>
  TRANSITIONS[from].includes(to);

export const allowedTransitions = (from: BookingStatus): readonly BookingStatus[] =>
  TRANSITIONS[from];

/**
 * Throws unless the transition is legal. Jobs run twice, so callers must also
 * treat "already in the target state" as success rather than as an error —
 * `isNoOp` exists for exactly that.
 */
export function assertTransition(from: BookingStatus, to: BookingStatus, actor: ActorType): void {
  if (!canTransition(from, to)) {
    throw new AppException(ErrorCode.ILLEGAL_TRANSITION, `Cannot move ${from} → ${to}`, {
      from,
      to,
      actor,
      allowed: TRANSITIONS[from],
    });
  }
}

/** A retried job arriving at a state already reached is a no-op, not a failure. */
export const isNoOp = (from: BookingStatus, to: BookingStatus): boolean => from === to;
