import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

import { DEFAULT_JOB_OPTIONS, Queue } from './queue.constants';
import { redisProvider, REDIS_CLIENT } from './redis.provider';

const queues = Object.values(Queue).map((name) => ({ name }));

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue(...queues),
  ],
  providers: [redisProvider],
  exports: [BullModule, REDIS_CLIENT],
})
export class QueueModule {}
