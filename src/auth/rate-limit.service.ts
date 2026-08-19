import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../queue/redis.provider';
import { AppException } from '../shared/errors/app.exception';
import { ErrorCode } from '../shared/errors/error-codes';

/**
 * Fixed-window counters in Redis (TRD §7). A fixed window can let through up to
 * two windows' worth of requests across a boundary; for OTP cost control that is
 * an acceptable trade against the memory a sliding log would need.
 */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Increments the counter and throws RATE_LIMITED once the ceiling is passed. */
  async consume(bucket: string, limit: number, windowSeconds: number): Promise<void> {
    const key = `ratelimit:${bucket}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      // Only the first caller in a window sets the expiry, so the window is
      // anchored to its start rather than sliding forward on every request.
      await this.redis.expire(key, windowSeconds);
    }

    if (count > limit) {
      const ttl = await this.redis.ttl(key);
      throw new AppException(ErrorCode.RATE_LIMITED, 'Too many requests, try again later', {
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      });
    }
  }
}
