import { Injectable } from '@nestjs/common';

/** Flags this service may raise. Flags never reject on their own (TRD §8). */
export const TimeFlag = {
  TIME_SKEW: 'TIME_SKEW',
  CLOCK_UNANCHORED: 'CLOCK_UNANCHORED',
  UPTIME_RESET: 'UPTIME_RESET',
  FUTURE_CAPTURE_CLAMPED: 'FUTURE_CAPTURE_CLAMPED',
} as const;

export type TimeFlagValue = (typeof TimeFlag)[keyof typeof TimeFlag];

/** The timing triple submitted with an event. Device values are evidence, not fact. */
export interface TimingTriple {
  /** Device wall-clock at capture. Attacker-controlled. */
  deviceWallClockAt: Date;
  /** Device monotonic uptime at capture, in ms. Cannot be moved backwards by the user. */
  deviceUptimeMs: number;
  /** Server receipt time. The only trusted clock. */
  serverReceivedAt: Date;
}

/**
 * The worker's previous event, which pins a device uptime reading to a server
 * instant we trust. This anchor is what lets a late-submitted offline check-in
 * land at its real capture time.
 */
export interface TimingAnchor {
  deviceUptimeMs: number;
  serverReceivedAt: Date;
}

export type CaptureSource = 'uptime_anchor' | 'device_wall_clock';

export interface ArbitrationResult {
  /** What the server concludes the capture instant actually was. */
  derivedCaptureAt: Date;
  source: CaptureSource;
  /** deviceWallClock − derivedCapture, in ms. Positive means the device runs fast. */
  skewMs: number;
  flags: TimeFlagValue[];
}

/**
 * Time arbitration (TRD §8.3). Device clocks are attacker-controlled; server
 * time is the only trusted clock. This is what makes offline check-in safe:
 * a check-in captured at 09:00 and uploaded at 14:00 must land at 09:00, and a
 * device that lies about its wall clock must not be able to move it there.
 *
 * Tolerance is passed in, never read from a constant — no threshold lives in
 * code (TRD §2.5, BT-3 says start permissive and tighten with data).
 */
@Injectable()
export class TimeArbitrationService {
  arbitrate(
    triple: TimingTriple,
    anchor: TimingAnchor | null,
    skewToleranceMs: number,
  ): ArbitrationResult {
    const flags: TimeFlagValue[] = [];
    const serverMs = triple.serverReceivedAt.getTime();

    let derivedMs: number;
    let source: CaptureSource;

    const uptimeDelta = anchor ? triple.deviceUptimeMs - anchor.deviceUptimeMs : null;

    if (anchor && uptimeDelta !== null && uptimeDelta >= 0) {
      // Uptime is monotonic, so the elapsed real time since the anchor is known
      // even if the wall clock was tampered with in between.
      derivedMs = anchor.serverReceivedAt.getTime() + uptimeDelta;
      source = 'uptime_anchor';
    } else {
      if (anchor && uptimeDelta !== null && uptimeDelta < 0) {
        // Uptime went backwards: the device rebooted, so the anchor is void.
        flags.push(TimeFlag.UPTIME_RESET);
      }
      flags.push(TimeFlag.CLOCK_UNANCHORED);
      derivedMs = triple.deviceWallClockAt.getTime();
      source = 'device_wall_clock';
    }

    // Nothing can be captured after the server received it.
    if (derivedMs > serverMs) {
      derivedMs = serverMs;
      flags.push(TimeFlag.FUTURE_CAPTURE_CLAMPED);
    }

    const skewMs = triple.deviceWallClockAt.getTime() - derivedMs;
    if (Math.abs(skewMs) > skewToleranceMs) {
      // Flag, do not reject (BT-3). Ops decides what a skewed clock means.
      flags.push(TimeFlag.TIME_SKEW);
    }

    return { derivedCaptureAt: new Date(derivedMs), source, skewMs, flags };
  }
}
