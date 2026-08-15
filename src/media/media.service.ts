import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

export const R2_CLIENT = 'R2_CLIENT';

export interface PresignedUpload {
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

/**
 * Presigned PUT directly to R2 (TRD §9). The API never proxies image bytes.
 *
 * Keys are server-generated and namespaced by worker and booking, so a client
 * cannot address another worker's object — the attendance MediaStage re-checks
 * that prefix rather than trusting the key it is handed.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(R2_CLIENT) private readonly s3: S3Client,
    private readonly config: ConfigService,
  ) {}

  async presignAttendancePhoto(
    workerId: string,
    bookingId: string,
    contentType: string,
  ): Promise<PresignedUpload> {
    const objectKey = `attendance/${workerId}/${bookingId}/${randomUUID()}`;
    return this.presign(objectKey, contentType);
  }

  async presignProfilePhoto(workerId: string, contentType: string): Promise<PresignedUpload> {
    return this.presign(`profile/${workerId}/${randomUUID()}`, contentType);
  }

  private async presign(objectKey: string, contentType: string): Promise<PresignedUpload> {
    const expiresInSeconds = Number(this.config.get('R2_PRESIGN_TTL_SECONDS') ?? 300);

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.config.getOrThrow<string>('R2_BUCKET'),
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: expiresInSeconds },
    );

    return { objectKey, uploadUrl, expiresInSeconds };
  }
}
