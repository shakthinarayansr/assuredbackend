import { TimeArbitrationService, TimeFlag } from './time-arbitration.service';

const at = (iso: string): Date => new Date(iso);
const TOLERANCE_MS = 5 * 60 * 1000;

describe('TimeArbitrationService', () => {
  const service = new TimeArbitrationService();

  it('lands a late-submitted offline check-in at its capture time, not upload time', () => {
    // Anchor: an earlier event, received by the server at 08:00, uptime 1h.
    const anchor = { deviceUptimeMs: 3_600_000, serverReceivedAt: at('2026-08-15T08:00:00Z') };

    // Captured at 09:00 (uptime 2h), uploaded five hours later at 14:00.
    const result = service.arbitrate(
      {
        deviceWallClockAt: at('2026-08-15T09:00:00Z'),
        deviceUptimeMs: 7_200_000,
        serverReceivedAt: at('2026-08-15T14:00:00Z'),
      },
      anchor,
      TOLERANCE_MS,
    );

    expect(result.derivedCaptureAt.toISOString()).toBe('2026-08-15T09:00:00.000Z');
    expect(result.source).toBe('uptime_anchor');
    expect(result.flags).not.toContain(TimeFlag.TIME_SKEW);
  });

  it('flags a device that lies about its wall clock, and ignores the lie', () => {
    const anchor = { deviceUptimeMs: 3_600_000, serverReceivedAt: at('2026-08-15T08:00:00Z') };

    // Real elapsed uptime says 09:00, but the device claims it is 08:05 —
    // an attempt to appear inside the check-in window.
    const result = service.arbitrate(
      {
        deviceWallClockAt: at('2026-08-15T08:05:00Z'),
        deviceUptimeMs: 7_200_000,
        serverReceivedAt: at('2026-08-15T14:00:00Z'),
      },
      anchor,
      TOLERANCE_MS,
    );

    expect(result.derivedCaptureAt.toISOString()).toBe('2026-08-15T09:00:00.000Z');
    expect(result.skewMs).toBe(-55 * 60 * 1000);
    expect(result.flags).toContain(TimeFlag.TIME_SKEW);
  });

  it('voids the anchor when uptime goes backwards (device rebooted)', () => {
    const anchor = { deviceUptimeMs: 7_200_000, serverReceivedAt: at('2026-08-15T08:00:00Z') };

    const result = service.arbitrate(
      {
        deviceWallClockAt: at('2026-08-15T09:00:00Z'),
        deviceUptimeMs: 60_000,
        serverReceivedAt: at('2026-08-15T09:00:30Z'),
      },
      anchor,
      TOLERANCE_MS,
    );

    expect(result.flags).toContain(TimeFlag.UPTIME_RESET);
    expect(result.flags).toContain(TimeFlag.CLOCK_UNANCHORED);
    expect(result.source).toBe('device_wall_clock');
  });

  it('clamps a capture instant claimed to be in the future', () => {
    const result = service.arbitrate(
      {
        deviceWallClockAt: at('2026-08-15T12:00:00Z'),
        deviceUptimeMs: 60_000,
        serverReceivedAt: at('2026-08-15T09:00:00Z'),
      },
      null,
      TOLERANCE_MS,
    );

    expect(result.derivedCaptureAt.toISOString()).toBe('2026-08-15T09:00:00.000Z');
    expect(result.flags).toContain(TimeFlag.FUTURE_CAPTURE_CLAMPED);
    expect(result.flags).toContain(TimeFlag.TIME_SKEW);
  });

  it('falls back to the device clock with a flag when there is no anchor', () => {
    const result = service.arbitrate(
      {
        deviceWallClockAt: at('2026-08-15T09:00:00Z'),
        deviceUptimeMs: 60_000,
        serverReceivedAt: at('2026-08-15T09:00:10Z'),
      },
      null,
      TOLERANCE_MS,
    );

    expect(result.source).toBe('device_wall_clock');
    expect(result.flags).toEqual([TimeFlag.CLOCK_UNANCHORED]);
    expect(result.skewMs).toBe(0);
  });
});
