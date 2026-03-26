import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermanentError, RetryableError } from '@lib/queue';
import { S3Service } from '@lib/storage';
import type {
  IS3PromotionService,
  S3PromotionResult,
} from '../interfaces/s3-promotion.interface';

@Injectable()
export class S3PromotionService implements IS3PromotionService {
  private readonly logger = new Logger(S3PromotionService.name);
  private readonly cleanBucket: string;

  constructor(
    private readonly s3Service: S3Service,
    configService: ConfigService,
  ) {
    this.cleanBucket = configService.get<string>(
      'storage.buckets.filesBucketName',
    )!;
  }

  async promote(
    sourceBucket: string,
    sourceKey: string,
  ): Promise<S3PromotionResult> {
    const sourceExists = await this.s3Service.headObject(
      sourceBucket,
      sourceKey,
    );

    if (!sourceExists) {
      // Idempotency: check if it already landed in the clean bucket
      const cleanExists = await this.s3Service.headObject(
        this.cleanBucket,
        sourceKey,
      );

      if (cleanExists) {
        this.logger.log(
          `File already in clean bucket — idempotent retry: ${this.cleanBucket}/${sourceKey}`,
        );
        return { bucket: this.cleanBucket, key: sourceKey };
      }

      throw new PermanentError(
        `File not found in quarantine or clean bucket: ${sourceBucket}/${sourceKey}`,
      );
    }

    try {
      await this.s3Service.copyObject(
        sourceBucket,
        sourceKey,
        this.cleanBucket,
        sourceKey,
      );
    } catch (error) {
      throw new RetryableError(
        `Failed to copy ${sourceBucket}/${sourceKey} to ${this.cleanBucket}: ${(error as Error).message}`,
      );
    }

    const verifyResult = await this.s3Service.headObject(
      this.cleanBucket,
      sourceKey,
    );

    if (!verifyResult) {
      throw new RetryableError(
        `Copy verification failed — object not found in clean bucket after copy: ${this.cleanBucket}/${sourceKey}`,
      );
    }

    try {
      await this.s3Service.deleteObject(sourceBucket, sourceKey);
    } catch (error) {
      this.logger.warn(
        `Failed to delete quarantine object after successful copy — orphaned file is harmless: ${sourceBucket}/${sourceKey}. Error: ${(error as Error).message}`,
      );
    }

    return { bucket: this.cleanBucket, key: sourceKey };
  }
}
