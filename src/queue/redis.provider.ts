import { Injectable, OnModuleDestroy, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Shared connection for the config cache and rate-limit counters (TRD §7, §12).
 *
 * Closes itself on shutdown. A factory returning a bare ioredis instance cannot
 * do that — Nest only calls lifecycle hooks on providers that implement them —
 * and the leaked socket keeps the process alive after the app closes.
 */
@Injectable()
export class RedisClient extends Redis implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super(config.getOrThrow<string>('REDIS_URL'), { maxRetriesPerRequest: null });
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useClass: RedisClient,
};
