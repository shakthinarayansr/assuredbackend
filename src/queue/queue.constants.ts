/**
 * Background jobs (TRD §10). Every job may run twice; none may double-apply.
 * The idempotency approach for each is recorded next to it — it is a property
 * of the job, not of the worker that happens to run it.
 */
export const Queue = {
  /** Offer expiry sweep — guarded by current status. */
  OFFERS: 'offers',
  /** Confirmation dispatch and escalation — unique per booking + type. */
  CONFIRMATIONS: 'confirmations',
  /**
   * No-show detection — the most correctness-critical job. Per-booking delayed
   * job keyed on booking id, plus a periodic reconciliation sweep that catches
   * anything the queue lost.
   */
  NO_SHOW: 'no-show',
  /** Reliability recompute — snapshot keyed by version + timestamp. */
  RELIABILITY: 'reliability',
  /** Push-then-MSG91 fallback — guarded by the engagement record. */
  NOTIFICATIONS: 'notifications',
  /** Media purge and idempotency-record expiry — idempotent by nature. */
  MAINTENANCE: 'maintenance',
  /** Metrics rollup — recomputable. */
  METRICS: 'metrics',
} as const;

export type QueueName = (typeof Queue)[keyof typeof Queue];

export const JobName = {
  EXPIRE_OFFERS: 'expire-offers',
  DISPATCH_CONFIRMATION: 'dispatch-confirmation',
  ESCALATE_CONFIRMATION: 'escalate-confirmation',
  DETECT_NO_SHOW: 'detect-no-show',
  RECONCILE_NO_SHOWS: 'reconcile-no-shows',
  RECOMPUTE_RELIABILITY: 'recompute-reliability',
  SEND_NOTIFICATION: 'send-notification',
  FALLBACK_NOTIFICATION: 'fallback-notification',
  PURGE_MEDIA: 'purge-media',
  PURGE_IDEMPOTENCY: 'purge-idempotency',
  ROLLUP_METRICS: 'rollup-metrics',
} as const;

/**
 * A stable job id makes enqueueing itself idempotent: BullMQ drops a second
 * job with an id already present. Booking-scoped jobs must use these.
 */
export const jobId = {
  noShow: (bookingId: string): string => `no-show:${bookingId}`,
  confirmation: (bookingId: string, type: string): string => `confirm:${bookingId}:${type}`,
  offerExpiry: (bookingId: string): string => `offer-expiry:${bookingId}`,
  reliability: (workerId: string, at: string): string => `reliability:${workerId}:${at}`,
};

export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 5_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
