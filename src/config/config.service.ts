import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../queue/redis.provider';
import { CONFIG_DEFAULTS, ConfigKeyValue, FLAG_DEFAULTS, FeatureFlagKeyValue } from './config-keys';

const CACHE_PREFIX = 'config:';
const CACHE_TTL_SECONDS = 300;

/**
 * Thresholds and flags live in the database, cached in Redis, invalidated on
 * write (TRD §12). No threshold may be read from an environment variable or a
 * constant — the defaults in config-keys.ts are seeds, not sources of truth.
 */
@Injectable()
export class PlatformConfigService {
  private readonly logger = new Logger(PlatformConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async get<T>(key: ConfigKeyValue): Promise<T> {
    const cached = await this.redis.get(CACHE_PREFIX + key);
    if (cached !== null) return JSON.parse(cached) as T;

    const row = await this.prisma.config.findUnique({ where: { key } });
    const value = (row?.value ?? CONFIG_DEFAULTS[key]) as T;

    if (!row) {
      this.logger.warn({ key }, 'Config key missing from database; using seed default');
    }

    await this.redis.set(CACHE_PREFIX + key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    return value;
  }

  async getNumber(key: ConfigKeyValue): Promise<number> {
    return this.get<number>(key);
  }

  async isEnabled(key: FeatureFlagKeyValue): Promise<boolean> {
    const cached = await this.redis.get(CACHE_PREFIX + key);
    if (cached !== null) return cached === 'true';

    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    const enabled = row?.enabled ?? FLAG_DEFAULTS[key];

    await this.redis.set(CACHE_PREFIX + key, String(enabled), 'EX', CACHE_TTL_SECONDS);
    return enabled;
  }

  /** Ops write path. Every change is audited with actor and timestamp. */
  async set(key: ConfigKeyValue, value: unknown, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.config.findUnique({ where: { key } });

      await tx.config.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedBy: actorId },
        update: {
          value: value as Prisma.InputJsonValue,
          updatedBy: actorId,
          version: { increment: 1 },
        },
      });

      await tx.configAudit.create({
        data: {
          key,
          oldValue: (previous?.value ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          newValue: value as Prisma.InputJsonValue,
          actorId,
        },
      });
    });

    await this.redis.del(CACHE_PREFIX + key);
  }

  async setFlag(key: FeatureFlagKeyValue, enabled: boolean, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.featureFlag.findUnique({ where: { key } });

      await tx.featureFlag.upsert({
        where: { key },
        create: { key, enabled, updatedBy: actorId },
        update: { enabled, updatedBy: actorId },
      });

      await tx.configAudit.create({
        data: {
          key,
          oldValue: { enabled: previous?.enabled ?? null },
          newValue: { enabled },
          actorId,
        },
      });
    });

    await this.redis.del(CACHE_PREFIX + key);
  }

  /** The client-facing bundle, served from the versioned config endpoint. */
  async clientBundle(): Promise<Record<string, unknown>> {
    const [configRows, flagRows] = await Promise.all([
      this.prisma.config.findMany(),
      this.prisma.featureFlag.findMany(),
    ]);

    const values: Record<string, unknown> = { ...CONFIG_DEFAULTS };
    for (const row of configRows) values[row.key] = row.value;

    const flags: Record<string, boolean> = { ...FLAG_DEFAULTS };
    for (const row of flagRows) flags[row.key] = row.enabled;

    const version = configRows.reduce((sum, row) => sum + row.version, 0);
    return { version, values, flags };
  }
}
