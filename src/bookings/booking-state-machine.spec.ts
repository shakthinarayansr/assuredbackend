import { ActorType, BookingStatus } from '@prisma/client';

import { AppException } from '../shared/errors/app.exception';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminal,
  TERMINAL_STATUSES,
} from './booking-state-machine';

const ALL_STATUSES = Object.values(BookingStatus);

describe('booking state machine', () => {
  it('permits the happy path end to end', () => {
    const path: BookingStatus[] = [
      BookingStatus.OFFERED,
      BookingStatus.ACCEPTED,
      BookingStatus.CONFIRMED,
      BookingStatus.CHECKED_IN,
      BookingStatus.CHECKED_OUT,
      BookingStatus.COMPLETED,
    ];

    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('rejects every transition not explicitly allowed', () => {
    for (const from of ALL_STATUSES) {
      const allowed = allowedTransitions(from);
      for (const to of ALL_STATUSES) {
        if (allowed.includes(to)) continue;
        expect(() => assertTransition(from, to, ActorType.SYSTEM)).toThrow(AppException);
      }
    }
  });

  it('lets nothing leave a terminal status', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(isTerminal(status)).toBe(true);
      expect(allowedTransitions(status)).toHaveLength(0);
    }
  });

  it('does not allow a no-show after check-in', () => {
    expect(canTransition(BookingStatus.CHECKED_IN, BookingStatus.NO_SHOW)).toBe(false);
  });

  it('does not allow check-in from an expired or declined offer', () => {
    expect(canTransition(BookingStatus.EXPIRED, BookingStatus.CHECKED_IN)).toBe(false);
    expect(canTransition(BookingStatus.DECLINED, BookingStatus.CHECKED_IN)).toBe(false);
  });

  it('allows check-in without an explicit confirmation step', () => {
    // Confirmations are a nudge, not a gate — a worker who never responded may
    // still check in validly.
    expect(canTransition(BookingStatus.ACCEPTED, BookingStatus.CHECKED_IN)).toBe(true);
  });

  it('carries the allowed set in the error details', () => {
    // Fails cleanly if nothing throws, rather than falling off the end of the
    // try block and passing vacuously.
    expect.assertions(3);

    try {
      assertTransition(BookingStatus.COMPLETED, BookingStatus.CHECKED_IN, ActorType.OPS);
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('ILLEGAL_TRANSITION');
      // COMPLETED is terminal, so ops is told there is nowhere to go.
      expect((error as AppException).getResponse()).toMatchObject({
        details: { from: BookingStatus.COMPLETED, allowed: [] },
      });
    }
  });
});
