import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OverridesService } from 'src/modules/tenants/overrides.service';
import { FeaturesService } from 'src/modules/tenants/features.service';
import { getEntitlementsConfig } from 'src/config/entitlements.config';

@Injectable()
export class ExpiredOverridesCleanupJob {
  private readonly logger = new Logger(ExpiredOverridesCleanupJob.name);
  private isOverridesCleanupRunning = false;
  private isCacheCleanupRunning = false;

  constructor(
    private readonly overridesService: OverridesService,
    private readonly featuresService: FeaturesService,
  ) {}

  @Cron('0 * * * *')
  async handleExpiredOverridesCleanup(): Promise<void> {
    const config = getEntitlementsConfig();
    if (!config.jobsEnabled || this.isOverridesCleanupRunning) {
      return;
    }

    this.isOverridesCleanupRunning = true;
    try {
      this.logger.log('Starting expired overrides cleanup');

      const deletedCount =
        await this.overridesService.cleanupExpiredOverrides();

      this.logger.log(
        `Expired overrides cleanup completed. Deleted: ${deletedCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to cleanup expired overrides: ${(error as Error).message}`,
        error,
      );
    } finally {
      this.isOverridesCleanupRunning = false;
    }
  }

  @Cron('30 * * * *') // Run at :30 minutes to avoid overlap with overrides cleanup
  handleStaleCacheCleanup(): void {
    const config = getEntitlementsConfig();
    if (!config.jobsEnabled || this.isCacheCleanupRunning) {
      return;
    }

    this.isCacheCleanupRunning = true;
    try {
      this.logger.debug('Starting stale cache cleanup');

      const cleaned = this.featuresService.cleanupStaleCache();

      if (cleaned > 0) {
        this.logger.log(
          `Stale cache cleanup completed. Cleaned: ${cleaned} entries`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup stale cache: ${(error as Error).message}`,
        error,
      );
    } finally {
      this.isCacheCleanupRunning = false;
    }
  }
}
