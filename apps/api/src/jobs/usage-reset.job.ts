import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UsageTrackingService } from '../modules/tenants/usage-tracking.service';
import { getEntitlementsConfig } from '../config/entitlements.config';

@Injectable()
export class UsageResetJob {
  private readonly logger = new Logger(UsageResetJob.name);
  private isRunning = false;

  constructor(private readonly usageTrackingService: UsageTrackingService) {}

  @Cron('0 0 * * *')
  async handleUsageReset(): Promise<void> {
    const config = getEntitlementsConfig();
    if (!config.jobsEnabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      this.logger.log('Starting monthly usage reset job');

      const tenantIds =
        await this.usageTrackingService.findTenantsWithResetDueToday();
      let processed = 0;
      let errors = 0;

      for (const tenantId of tenantIds) {
        try {
          await this.usageTrackingService.resetTenantUsage(tenantId);
          processed++;
        } catch (error) {
          errors++;
          this.logger.error(
            `Failed to reset usage for tenant ${tenantId}: ${(error as Error).message}`,
          );
        }
      }

      this.logger.log(
        `Usage reset job completed. Processed: ${processed}, Errors: ${errors}`,
      );
    } catch (error) {
      this.logger.error(
        `Usage reset job failed: ${(error as Error).message}`,
        error,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
