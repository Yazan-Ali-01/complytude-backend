import type { Job, TenantDataRetentionSweepJobData } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { DOCUMENT_TRASH_DAYS } from 'src/common/constants/retention.constant';
import { RetentionRepository } from '../../../repositories/maintenance/retention.repository';
import { StorageService } from '../../storage/storage.service';

/** Uploads not confirmed within this many days are removed (S3 expires their object too). */
export const ABANDONED_UPLOAD_DAYS = 2;

/**
 * Daily housekeeping: expired auth tokens are deleted, expired invitations marked, abandoned
 * uploads removed, and documents in the trash for 30 days erased with their files, so none of them
 * is kept indefinitely.
 */
@Injectable()
export class DataRetentionSweepHandler {
  private readonly logger = new Logger(DataRetentionSweepHandler.name);

  constructor(
    private readonly retention: RetentionRepository,
    private readonly storage: StorageService,
  ) {}

  async execute(_job?: Job<TenantDataRetentionSweepJobData>): Promise<void> {
    await this.retention.deleteExpiredTokens();
    const invitations = await this.retention.expireInvitations();
    const uploads = await this.retention.deleteAbandonedUploads(
      ABANDONED_UPLOAD_DAYS,
    );
    const erased =
      await this.retention.eraseTrashedDocuments(DOCUMENT_TRASH_DAYS);
    // After the commit: a file left behind by a failed delete is logged, never served (its row is
    // erased and out of every list)
    let filesRemoved = 0;
    for (const document of erased) {
      if (!document.s3Bucket || !document.s3Key) continue;
      try {
        await this.storage.deleteObjectFromBucket(
          document.s3Bucket,
          document.s3Key,
        );
        filesRemoved++;
      } catch (error) {
        this.logger.error(
          `Retention sweep: file of erased document ${document.id} not removed (bucket=${document.s3Bucket} key=${document.s3Key}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.logger.log(
      `Retention sweep: ${invitations} invitations expired, ${uploads.length} abandoned uploads removed, ${erased.length} trashed documents erased (${filesRemoved} files removed)`,
    );
  }
}
