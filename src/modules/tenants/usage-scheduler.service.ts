import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from 'src/database/database.service';
import {
  USAGE_TRACKED_FEATURES,
  getDefaultPlanFeatures,
  isValidPlan,
} from 'src/config/plan-features.config';
import { PlanType } from './entities/tenant.entity';

@Injectable()
export class UsageSchedulerService {
  private readonly logger = new Logger(UsageSchedulerService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Runs at midnight on the 1st of every month.
   * Initializes usage records for all active tenants for the new billing period.
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async initializeMonthlyUsage(): Promise<void> {
    this.logger.log('Starting monthly usage initialization...');

    try {
      // Get billing period boundaries
      const periodResult = await this.databaseService.query(
        `SELECT
           DATE_TRUNC('month', CURRENT_DATE)::DATE as period_start,
           (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE as period_end`,
      );

      const { period_start, period_end } = periodResult.rows[0];

      // Get all active tenants with their plans
      const tenantsResult = await this.databaseService.query(
        `SELECT tenant_id, plan FROM public.tenants WHERE is_active = true`,
      );

      this.logger.log(
        `Found ${tenantsResult.rows.length} active tenants to initialize`,
      );

      let initialized = 0;
      let skipped = 0;

      for (const tenant of tenantsResult.rows) {
        const { tenant_id, plan } = tenant;

        if (!isValidPlan(plan)) {
          this.logger.warn(
            `Skipping tenant ${tenant_id}: invalid plan "${plan}"`,
          );
          skipped++;
          continue;
        }

        const planFeatures = getDefaultPlanFeatures(plan);

        // Initialize usage records for each tracked feature
        for (const featureKey of USAGE_TRACKED_FEATURES) {
          const limit = planFeatures[featureKey];

          await this.databaseService.query(
            `INSERT INTO public.tenant_usage
             (tenant_id, feature_key, billing_period_start, billing_period_end, current_usage, usage_limit)
             VALUES ($1, $2, $3, $4, 0, $5)
             ON CONFLICT (tenant_id, feature_key, billing_period_start) DO NOTHING`,
            [tenant_id, featureKey, period_start, period_end, limit],
          );
        }

        initialized++;
      }

      this.logger.log(
        `Monthly usage initialization complete: ${initialized} tenants initialized, ${skipped} skipped`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize monthly usage', error);
      throw error;
    }
  }

  /**
   * Manual trigger for testing or catch-up initialization.
   * Can be called via admin endpoint or during deployment.
   */
  async initializeUsageForTenant(tenantId: string): Promise<void> {
    this.logger.log(`Initializing usage for tenant: ${tenantId}`);

    const tenantResult = await this.databaseService.query(
      `SELECT plan FROM public.tenants WHERE tenant_id = $1 AND is_active = true`,
      [tenantId],
    );

    if (tenantResult.rows.length === 0) {
      throw new Error(`Tenant ${tenantId} not found or inactive`);
    }

    const { plan } = tenantResult.rows[0];

    if (!isValidPlan(plan)) {
      throw new Error(`Invalid plan "${plan}" for tenant ${tenantId}`);
    }

    const periodResult = await this.databaseService.query(
      `SELECT
         DATE_TRUNC('month', CURRENT_DATE)::DATE as period_start,
         (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE as period_end`,
    );

    const { period_start, period_end } = periodResult.rows[0];
    const planFeatures = getDefaultPlanFeatures(plan);

    for (const featureKey of USAGE_TRACKED_FEATURES) {
      const limit = planFeatures[featureKey];

      await this.databaseService.query(
        `INSERT INTO public.tenant_usage
         (tenant_id, feature_key, billing_period_start, billing_period_end, current_usage, usage_limit)
         VALUES ($1, $2, $3, $4, 0, $5)
         ON CONFLICT (tenant_id, feature_key, billing_period_start) DO NOTHING`,
        [tenantId, featureKey, period_start, period_end, limit],
      );
    }

    this.logger.log(`Usage initialized for tenant: ${tenantId}`);
  }
}
