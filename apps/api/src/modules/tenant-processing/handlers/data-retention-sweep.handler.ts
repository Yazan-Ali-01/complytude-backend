import type { Job, TenantDataRetentionSweepJobData } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { RetentionRepository } from '../../../repositories/maintenance/retention.repository';

/** Uploads not confirmed within this many days are removed (S3 expires their object too). */
export const ABANDONED_UPLOAD_DAYS = 2;

/**
 * Daily housekeeping: expired auth tokens are deleted, expired invitations marked, and abandoned
 * uploads removed, so none of them is kept indefinitely.
 */
@Injectable()
export class DataRetentionSweepHandler {
  private readonly logger = new Logger(DataRetentionSweepHandler.name);

  constructor(private readonly retention: RetentionRepository) {}

  async execute(_job?: Job<TenantDataRetentionSweepJobData>): Promise<void> {
    await this.retention.deleteExpiredTokens();
    const invitations = await this.retention.expireInvitations();
    const uploads = await this.retention.deleteAbandonedUploads(
      ABANDONED_UPLOAD_DAYS,
    );
    this.logger.log(
      `Retention sweep: ${invitations} invitations expired, ${uploads.length} abandoned uploads removed`,
    );
  }
}
