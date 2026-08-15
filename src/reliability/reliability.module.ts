import { Module } from '@nestjs/common';

/**
 * scoring, snapshots (TRD §4, §10).
 *
 * To build: recompute on terminal booking events, writing a versioned snapshot
 * keyed by formula version + timestamp — never mutating a score in place. The
 * formula itself is BT-1 (founders decide post-pilot); the versioning is built
 * from day one so the decision is cheap when it lands. Worker visibility is
 * behind SCORE_VISIBLE_TO_WORKER.
 */
@Module({})
export class ReliabilityModule {}
