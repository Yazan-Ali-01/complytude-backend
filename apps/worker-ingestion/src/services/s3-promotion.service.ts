import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermanentError, RetryableError } from '@lib/queue';
import { S3Service } from '@lib/storage';
import type {
  IS3PromotionService,
  S3PromotionResult,
} from '../interfaces/s3-promotion.interface';

/** The tag GuardDuty Malware Protection for S3 writes on each object it scans. */
export const MALWARE_SCAN_TAG = 'GuardDutyMalwareScanStatus';
const CLEAN = 'NO_THREATS_FOUND';
const SCAN_POLL_INTERVAL_MS = 5000;

@Injectable()
export class S3PromotionService implements IS3PromotionService {
  private readonly logger = new Logger(S3PromotionService.name);
  private readonly cleanBucket: string;
  private readonly scanRequired: boolean;
  private readonly scanWaitMs: number;

  constructor(
    private readonly s3Service: S3Service,
    configService: ConfigService,
  ) {
    this.cleanBucket = configService.get<string>(
      'storage.buckets.filesBucketName',
    )!;
    this.scanRequired =
      configService.get<boolean>('workerIngestion.malwareScanRequired') ??
      false;
    this.scanWaitMs =
      configService.get<number>('workerIngestion.malwareScanWaitMs') ?? 60000;
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

    if (this.scanRequired) {
      await this.requireCleanScan(sourceBucket, sourceKey);
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

  /**
   * Waits (up to the configured time) for the scan result. Not scanned yet: retry the job
   * later. Anything but clean (threats found, or a file the scanner could not read) is final:
   * the file stays in quarantine, where it expires.
   */
  private async requireCleanScan(bucket: string, key: string): Promise<void> {
    const deadline = Date.now() + this.scanWaitMs;
    for (;;) {
      const status = (await this.s3Service.getObjectTags(bucket, key))[
        MALWARE_SCAN_TAG
      ];
      if (status === CLEAN) return;
      if (status) {
        this.logger.warn(
          `Upload refused by malware scan (${status}): ${bucket}/${key}`,
        );
        throw new PermanentError(
          `Malware scan did not pass (${status}): ${bucket}/${key}`,
        );
      }
      if (Date.now() + SCAN_POLL_INTERVAL_MS > deadline) {
        throw new RetryableError(
          `Malware scan result not available yet: ${bucket}/${key}`,
        );
      }
      await new Promise((resolve) =>
        setTimeout(resolve, SCAN_POLL_INTERVAL_MS),
      );
    }
  }
}
