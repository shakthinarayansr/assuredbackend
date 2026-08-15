import { Injectable, Logger } from '@nestjs/common';
import { AttendanceVerdict } from '@prisma/client';

import { PipelineContext, PipelineStage } from './pipeline.types';
import {
  AccuracyStage,
  BookingEligibilityStage,
  FaceVerificationStage,
  GeofenceStage,
  IntegrityStage,
  MediaStage,
  ShiftCodeStage,
  TimeArbitrationStage,
  WindowStage,
} from './stages';

export interface PipelineResult {
  verdict: AttendanceVerdict;
  rejectionReasons: string[];
  flags: string[];
  derivedCaptureAt: Date;
  distanceM?: number;
  faceConfidence?: number;
}

/**
 * The attendance validation pipeline (TRD §8) — the highest-risk subsystem.
 *
 * Stages run in order and ACCUMULATE verdicts rather than short-circuiting:
 * ops needs to see everything that was wrong, not the first thing. Verdict and
 * flags are stored separately, because "accepted with three flags" is a real
 * outcome and exactly what ops needs to look at.
 */
@Injectable()
export class AttendancePipelineService {
  private readonly logger = new Logger(AttendancePipelineService.name);
  private readonly stages: PipelineStage[];

  constructor(
    bookingEligibility: BookingEligibilityStage,
    media: MediaStage,
    time: TimeArbitrationStage,
    window: WindowStage,
    accuracy: AccuracyStage,
    geofence: GeofenceStage,
    integrity: IntegrityStage,
    face: FaceVerificationStage,
    code: ShiftCodeStage,
  ) {
    // Order matters: time arbitration must precede the window check, and the
    // geofence check must precede the speed heuristic.
    this.stages = [
      bookingEligibility,
      media,
      time,
      window,
      accuracy,
      geofence,
      integrity,
      face,
      code,
    ];
  }

  async run(context: PipelineContext): Promise<PipelineResult> {
    for (const stage of this.stages) {
      try {
        await stage.run(context);
      } catch (error) {
        // A stage that throws must not swallow the findings of the stages that
        // already ran. Record it and carry on.
        this.logger.error(
          { stage: stage.name, bookingId: context.booking.id, err: error },
          'Attendance stage failed',
        );
        context.flags.push(`STAGE_ERROR:${stage.name}`);
      }
    }

    const verdict = this.decide(context);

    return {
      verdict,
      rejectionReasons: [...context.rejections],
      flags: [...context.flags],
      derivedCaptureAt: context.derivedCaptureAt ?? context.serverReceivedAt,
      distanceM: context.distanceM,
      faceConfidence: context.faceConfidence,
    };
  }

  /**
   * Only a rejection reason refuses a check-in. Flags do not: an accepted
   * check-in carrying three flags is a legitimate, expected outcome, and
   * collapsing that into a rejection would be exactly the failure mode the
   * separate storage of verdict and flags exists to prevent.
   *
   * The one middle case is a flag that asks a human to look — low face-match
   * confidence flags for review and never auto-rejects (BE-CHK-06).
   */
  private decide(context: PipelineContext): AttendanceVerdict {
    if (context.rejections.length > 0) return AttendanceVerdict.REJECTED;
    if (context.flags.some((f) => REVIEW_FLAGS.has(f))) return AttendanceVerdict.PENDING_REVIEW;
    return AttendanceVerdict.ACCEPTED;
  }
}

/** Flags that route a submission to ops review rather than accepting it outright. */
const REVIEW_FLAGS = new Set(['FACE_LOW_CONFIDENCE', 'MOCK_LOCATION']);
