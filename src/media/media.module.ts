import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';

import { MediaService, R2_CLIENT } from './media.service';

@Module({
  providers: [
    {
      provide: R2_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): S3Client =>
        new S3Client({
          region: 'auto',
          endpoint: config.getOrThrow<string>('R2_ENDPOINT'),
          credentials: {
            accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
            secretAccessKey: config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
          },
        }),
    },
    MediaService,
  ],
  exports: [MediaService],
})
export class MediaModule {}
