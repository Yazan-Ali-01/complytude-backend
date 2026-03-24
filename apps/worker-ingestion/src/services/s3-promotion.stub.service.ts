import { Injectable, Logger } from '@nestjs/common';
import { PermanentError } from '@lib/queue';
import type {
  IS3PromotionService,
  S3PromotionResult,
} from '../interfaces/s3-promotion.interface';

/**
 * Stub implementation of IS3PromotionService.
 * Throws PermanentError — pipeline is blocked until COM-210 lands.
 * Replace with real S3 copy + delete in COM-210.
 */
@Injectable()
export class S3PromotionStubService implements IS3PromotionService {
  private readonly logger = new Logger(S3PromotionStubService.name);

  promote(sourceBucket: string, sourceKey: string): Promise<S3PromotionResult> {
    this.logger.warn(
      `[STUB] S3PromotionService not yet implemented — source=${sourceBucket}/${sourceKey}. Blocked on COM-210.`,
    );

    throw new PermanentError(
      'S3PromotionService not yet implemented. Blocked on COM-210.',
    );
  }
}
