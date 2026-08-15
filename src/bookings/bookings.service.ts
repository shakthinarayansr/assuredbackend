import { Injectable, Logger } from '@nestjs/common';
import { ActorType, Booking, BookingStatus, Prisma } from '@prisma/client';

import { PrismaService, PG_UNIQUE_VIOLATION } from '../prisma/prisma.service';
import { AppException } from '../shared/errors/app.exception';
import { ErrorCode } from '../shared/errors/error-codes';
import { assertTransition, isNoOp } from './booking-state-machine';

export interface TransitionInput {
  bookingId: string;
  to: BookingStatus;
  actorType: ActorType;
  actorId?: string;
  reason?: string;
  evidenceRef?: string;
  metadata?: Prisma.InputJsonValue;
  /**
   * Only apply if the booking is currently in one of these states. Jobs pass
   * this so a retry cannot double-apply (TRD §10).
   */
  expectedFrom?: readonly BookingStatus[];
}

/**
 * `bookings` is the only module permitted to write booking state (TRD §4).
 * Every transition writes the projection and appends the event in one
 * transaction — a status without a matching event is a corrupt audit trail.
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async transition(input: TransitionInput): Promise<Booking> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the row so two concurrent transitions serialise rather than
      // both reading the same "from" state.
      const rows = await tx.$queryRaw<Array<{ id: string; status: BookingStatus }>>`
        SELECT id, status FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE
      `;
      const current = rows[0];

      if (!current) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Booking not found');
      }

      if (isNoOp(current.status, input.to)) {
        // A retried job that already landed. Success, not an error.
        this.logger.debug(
          { bookingId: input.bookingId, status: input.to },
          'Transition is a no-op; already applied',
        );
        return tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
      }

      if (input.expectedFrom && !input.expectedFrom.includes(current.status)) {
        throw new AppException(
          ErrorCode.ILLEGAL_TRANSITION,
          `Booking is ${current.status}, expected one of ${input.expectedFrom.join(', ')}`,
          { from: current.status, to: input.to },
        );
      }

      assertTransition(current.status, input.to, input.actorType);

      try {
        const booking = await tx.booking.update({
          where: { id: input.bookingId },
          data: {
            status: input.to,
            ...(input.to === BookingStatus.ACCEPTED ? { acceptedAt: new Date() } : {}),
          },
        });

        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            fromStatus: current.status,
            toStatus: input.to,
            actorType: input.actorType,
            actorId: input.actorId,
            reason: input.reason,
            evidenceRef: input.evidenceRef,
            metadata: input.metadata,
          },
        });

        return booking;
      } catch (error) {
        // The partial unique index on (requirementId, seatIndex) fires when a
        // second worker tries to occupy a seat someone else just took.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === PG_UNIQUE_VIOLATION
        ) {
          throw new AppException(ErrorCode.SEAT_FILLED, 'This seat has already been filled');
        }
        throw error;
      }
    });
  }

  /**
   * A worker may not hold two bookings whose shifts overlap. Checked before
   * acceptance; the client renders OVERLAPPING_BOOKING distinctly.
   */
  async assertNoOverlap(workerId: string, startsAt: Date, endsAt: Date): Promise<void> {
    const clash = await this.prisma.booking.findFirst({
      where: {
        workerId,
        status: {
          in: [BookingStatus.ACCEPTED, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN],
        },
        requirement: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      },
      select: { id: true },
    });

    if (clash) {
      throw new AppException(
        ErrorCode.OVERLAPPING_BOOKING,
        'You already have a shift that overlaps this one',
        { bookingId: clash.id },
      );
    }
  }

  /** Full audit trail for the ops console — the event log, not a summary. */
  async auditTrail(bookingId: string) {
    return this.prisma.bookingEvent.findMany({
      where: { bookingId },
      orderBy: { occurredAt: 'asc' },
    });
  }
}
