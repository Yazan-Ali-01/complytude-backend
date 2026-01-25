import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OverridesService } from 'src/modules/tenants/overrides.service';
import { FeaturesService } from 'src/modules/tenants/features.service';
import { getEntitlementsConfig } from 'src/config/entitlements.config';

@Injectable()
export class ExpiredOverridesCleanupJob {
  private readonly logger = new Logger(ExpiredOverridesCleanupJob.name);
  private isRunning = false;

  constructor(
    private readonly overridesService: OverridesService,
    private readonly featuresService: FeaturesService,
  ) {}

  @Cron('0 * * * *')
  async handleExpiredOverridesCleanup(): Promise<void> {
    const config = getEntitlementsConfig();
    if (!config.jobsEnabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      this.logger.log('Starting expired overrides cleanup');

      const deletedCount =
        await this.overridesService.cleanupExpiredOverrides();

      this.logger.log(
        `Expired overrides cleanup completed. Deleted: ${deletedCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to cleanup expired overrides: ${error.message}`,
        error,
      );
    } finally {
      this.isRunning = false;
    }
  }

  @Cron('0 * * * *')
  handleStaleCacheCleanup(): void {
    const config = getEntitlementsConfig();
    if (!config.jobsEnabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
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
        `Failed to cleanup stale cache: ${error.message}`,
        error,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
