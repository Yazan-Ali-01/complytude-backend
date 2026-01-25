import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UsageTrackingService } from 'src/modules/tenants/usage-tracking.service';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { getEntitlementsConfig } from 'src/config/entitlements.config';

@Injectable()
export class UsageResetJob {
  private readonly logger = new Logger(UsageResetJob.name);
  private isRunning = false;

  constructor(
    private readonly usageTrackingService: UsageTrackingService,
    private readonly tenantRepository: TenantRepository,
  ) {}

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
          await this.usageTrackingService.resetAllMeteredFeatures(tenantId);
          processed++;
        } catch (error) {
          errors++;
          this.logger.error(
            `Failed to reset usage for tenant ${tenantId}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Usage reset job completed. Processed: ${processed}, Errors: ${errors}`,
      );
    } catch (error) {
      this.logger.error(`Usage reset job failed: ${error.message}`, error);
    } finally {
      this.isRunning = false;
    }
  }

  @Cron('0 1 * * *')
  async handleUsageSync(): Promise<void> {
    const config = getEntitlementsConfig();
    if (!config.jobsEnabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      this.logger.debug('Starting usage sync job');

      const tenants = await this.tenantRepository.findActive();
      let synced = 0;

      for (const tenant of tenants) {
        try {
          await this.usageTrackingService.getTenantUsageSummary(tenant.id);
          synced++;
        } catch (error) {
          this.logger.warn(
            `Could not sync usage for tenant ${tenant.id}: ${error.message}`,
          );
        }
      }

      this.logger.debug(`Usage sync job completed. Synced: ${synced}`);
    } catch (error) {
      this.logger.error(`Usage sync job failed: ${error.message}`, error);
    } finally {
      this.isRunning = false;
    }
  }
}
