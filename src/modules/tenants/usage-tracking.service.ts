import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { TenantService } from './tenant.service';
import { FeaturesService } from './features.service';
import { CreditsService } from './credits.service';
import {
  TenantUsage,
  UsageEvent,
  UsageCheckResult,
  UsageSummary,
  mapUsageRow,
  mapUsageEventRow,
  TenantUsageRow,
  UsageEventRow,
} from './entities/usage.entity';
import {
  METERED_FEATURES,
  MeteredFeature,
} from './entities/tenant-features.interface';

@Injectable()
export class UsageTrackingService {
  private readonly logger = new Logger(UsageTrackingService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantService: TenantService,
    private readonly featuresService: FeaturesService,
    @Inject(forwardRef(() => CreditsService))
    private readonly creditsService: CreditsService,
  ) {}

  /**
   * Get the current billing period for a tenant
   */
  private getCurrentBillingPeriod(): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { periodStart, periodEnd };
  }

  /**
   * Increment usage for a metered feature
   */
  async incrementUsage(
    tenantId: string,
    featureKey: MeteredFeature,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod();

      await this.databaseService.transaction(async (client) => {
        await client.query(
          `INSERT INTO public.tenant_usage
            (tenant_id, feature_key, period_start, period_end, usage_count)
           VALUES ($1, $2, $3, $4, 1)
           ON CONFLICT (tenant_id, feature_key, period_start)
           DO UPDATE SET usage_count = tenant_usage.usage_count + 1, updated_at = now()
           RETURNING id`,
          [tenantId, featureKey, periodStart, periodEnd],
        );

        await client.query(
          `INSERT INTO public.tenant_usage_events
            (tenant_id, feature_key, user_id, event_type, delta, metadata)
           VALUES ($1, $2, $3, 'increment', $4, $5)`,
          [
            tenantId,
            featureKey,
            userId || null,
            1,
            metadata ? JSON.stringify(metadata) : null,
          ],
        );
      });

      this.logger.debug(
        `Usage incremented for tenant ${tenantId}, feature: ${featureKey}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to increment usage for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException('Failed to record usage');
    }
  }

  /**
   * Decrement usage for a metered feature (e.g., document deleted)
   */
  async decrementUsage(
    tenantId: string,
    featureKey: MeteredFeature,
    userId?: string,
    delta = 1,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod();

      await this.databaseService.transaction(async (client) => {
        await client.query(
          `UPDATE public.tenant_usage
           SET usage_count = GREATEST(0, usage_count - $1), updated_at = now()
           WHERE tenant_id = $2 AND feature_key = $3 AND period_start = $4 AND period_end = $5
           RETURNING id`,
          [delta, tenantId, featureKey, periodStart, periodEnd],
        );

        await client.query(
          `INSERT INTO public.tenant_usage_events
            (tenant_id, feature_key, user_id, event_type, delta, metadata)
           VALUES ($1, $2, $3, 'decrement', $4, $5)`,
          [
            tenantId,
            featureKey,
            userId || null,
            delta,
            metadata ? JSON.stringify(metadata) : null,
          ],
        );
      });

      this.logger.debug(
        `Usage decremented for tenant ${tenantId}, feature: ${featureKey}, delta: ${delta}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to decrement usage for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException('Failed to update usage');
    }
  }

  /**
   * Check if tenant can use a metered feature based on their entitlements and usage
   */
  async checkUsageLimit(
    tenantId: string,
    featureKey: MeteredFeature,
  ): Promise<UsageCheckResult> {
    try {
      const features = await this.featuresService.getTenantFeatures(tenantId);
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod();

      const limit = (features[featureKey] as number) ?? 0;
      const current = await this.getCurrentUsage(tenantId, featureKey);

      let allowed: boolean;
      let remaining: number;
      let message: string;

      if (limit === -1) {
        allowed = true;
        remaining = -1;
        message = `${current}/${featureKey} used this month (unlimited)`;
      } else {
        allowed = current < limit;
        remaining = Math.max(0, limit - current);
        message = `${current}/${limit} ${featureKey} used this month`;
      }

      return {
        allowed,
        limit,
        current,
        remaining,
        periodStart,
        periodEnd,
        message,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to check usage limit for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException('Failed to check usage limits');
    }
  }

  /**
   * Atomically check usage limit and increment if allowed.
   * Uses row-level locking to prevent race conditions.
   *
   * @returns UsageCheckResult with allowed=true if increment succeeded, false if limit exceeded
   */
  async checkAndIncrementUsage(
    tenantId: string,
    featureKey: MeteredFeature,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<UsageCheckResult> {
    try {
      const features = await this.featuresService.getTenantFeatures(tenantId);
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod();
      const limit = (features[featureKey] as number) ?? 0;

      // Unlimited feature - just increment
      if (limit === -1) {
        await this.incrementUsage(tenantId, featureKey, userId, metadata);
        const current = await this.getCurrentUsage(tenantId, featureKey);
        return {
          allowed: true,
          limit: -1,
          current,
          remaining: -1,
          periodStart,
          periodEnd,
          message: `${current}/${featureKey} used this month (unlimited)`,
        };
      }

      // Use transaction with row-level locking for atomic check-and-increment
      const result = await this.databaseService.transaction(async (client) => {
        // Upsert and lock the usage row
        const usageResult = await client.query(
          `INSERT INTO public.tenant_usage
            (tenant_id, feature_key, period_start, period_end, usage_count)
           VALUES ($1, $2, $3, $4, 0)
           ON CONFLICT (tenant_id, feature_key, period_start)
           DO UPDATE SET updated_at = now()
           RETURNING usage_count FOR UPDATE`,
          [tenantId, featureKey, periodStart, periodEnd],
        );

        const currentUsage = usageResult.rows[0]?.usage_count ?? 0;

        // Check if increment would exceed limit
        if (currentUsage >= limit) {
          return {
            allowed: false,
            current: currentUsage,
          };
        }

        // Increment usage atomically
        await client.query(
          `UPDATE public.tenant_usage
           SET usage_count = usage_count + 1, updated_at = now()
           WHERE tenant_id = $1 AND feature_key = $2 AND period_start = $3`,
          [tenantId, featureKey, periodStart],
        );

        // Record the event
        await client.query(
          `INSERT INTO public.tenant_usage_events
            (tenant_id, feature_key, user_id, event_type, delta, metadata)
           VALUES ($1, $2, $3, 'increment', $4, $5)`,
          [
            tenantId,
            featureKey,
            userId || null,
            1,
            metadata ? JSON.stringify(metadata) : null,
          ],
        );

        return {
          allowed: true,
          current: currentUsage + 1,
        };
      });

      const remaining = Math.max(0, limit - result.current);

      if (result.allowed) {
        this.logger.debug(
          `Usage atomically incremented for tenant ${tenantId}, feature: ${featureKey}. Now: ${result.current}/${limit}`,
        );
      }

      return {
        allowed: result.allowed,
        limit,
        current: result.current,
        remaining,
        periodStart,
        periodEnd,
        message: result.allowed
          ? `${result.current}/${limit} ${featureKey} used this month`
          : `Usage limit exceeded: ${result.current}/${limit} ${featureKey}`,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to check and increment usage for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to check and increment usage',
      );
    }
  }

  /**
   * Check usage limit with credits fallback.
   * If plan quota is exceeded, attempts to consume a credit.
   *
   * Flow:
   * 1. Check if within plan quota → allow and increment
   * 2. If quota exceeded, check for available credits
   * 3. If credits available → consume one and allow
   * 4. If no credits → deny
   *
   * @returns UsageCheckResult with usedCredit and creditsRemaining fields
   */
  async checkAndIncrementWithCredits(
    tenantId: string,
    featureKey: MeteredFeature,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<UsageCheckResult> {
    try {
      // First, try the normal check and increment
      const result = await this.checkAndIncrementUsage(
        tenantId,
        featureKey,
        userId,
        metadata,
      );

      // If allowed within plan quota, return as-is
      if (result.allowed) {
        return {
          ...result,
          usedCredit: false,
        };
      }

      // Plan quota exceeded - check for credits
      this.logger.debug(
        `Plan quota exceeded for tenant ${tenantId}, feature ${featureKey}. Checking credits...`,
      );

      const availableCredits = await this.creditsService.getAvailableCredits(
        tenantId,
        featureKey,
      );

      if (availableCredits <= 0) {
        // No credits available - deny access
        this.logger.debug(
          `No credits available for tenant ${tenantId}, feature ${featureKey}`,
        );
        return {
          ...result,
          usedCredit: false,
          creditsRemaining: 0,
          message: `${result.message}. No credits available. Purchase credits to continue.`,
        };
      }

      // Credits available - consume one
      const consumed = await this.creditsService.consumeCredit(
        tenantId,
        featureKey,
      );

      if (!consumed) {
        // Race condition - credits were consumed between check and consume
        this.logger.warn(
          `Failed to consume credit for tenant ${tenantId}, feature ${featureKey} (race condition)`,
        );
        return {
          ...result,
          usedCredit: false,
          creditsRemaining: 0,
          message: `${result.message}. Credits unavailable. Please try again.`,
        };
      }

      const creditsRemaining = availableCredits - 1;

      this.logger.log(
        `Credit consumed for tenant ${tenantId}, feature ${featureKey}. Credits remaining: ${creditsRemaining}`,
      );

      // Record the credit usage in usage events
      await this.databaseService.query(
        `INSERT INTO public.tenant_usage_events
          (tenant_id, feature_key, user_id, event_type, delta, metadata)
         VALUES ($1, $2, $3, 'credit_consumed', $4, $5)`,
        [
          tenantId,
          featureKey,
          userId || null,
          1,
          JSON.stringify({
            ...metadata,
            credit_consumed: true,
            credits_remaining: creditsRemaining,
          }),
        ],
      );

      return {
        allowed: true,
        limit: result.limit,
        current: result.current,
        remaining: 0, // Plan quota exhausted
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        message: `Plan quota exceeded. Used 1 credit. ${creditsRemaining} credits remaining.`,
        usedCredit: true,
        creditsRemaining,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to check usage with credits for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to check usage with credits fallback',
      );
    }
  }

  /**
   * Get usage summary for all metered features in a single query
   */
  async getTenantUsageSummary(tenantId: string): Promise<UsageSummary> {
    try {
      const tenantFeatures =
        await this.featuresService.getTenantFeatures(tenantId);
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod();

      // Fetch all usage counts in one query
      const result = await this.databaseService.query(
        `SELECT feature_key, usage_count
         FROM public.tenant_usage
         WHERE tenant_id = $1 AND period_start = $2 AND period_end = $3
           AND feature_key = ANY($4)`,
        [tenantId, periodStart, periodEnd, [...METERED_FEATURES]],
      );

      const usageMap: Record<string, number> = {};
      for (const row of result.rows) {
        usageMap[row.feature_key] = row.usage_count as number;
      }

      const features: Record<string, UsageCheckResult> = {};
      for (const featureKey of METERED_FEATURES) {
        const limit = (tenantFeatures[featureKey] as number) ?? 0;
        const current = usageMap[featureKey] ?? 0;
        const isUnlimited = limit === -1;

        features[featureKey] = {
          allowed: isUnlimited || current < limit,
          limit,
          current,
          remaining: isUnlimited ? -1 : Math.max(0, limit - current),
          periodStart,
          periodEnd,
          message: isUnlimited
            ? `${current}/${featureKey} used this month (unlimited)`
            : `${current}/${limit} ${featureKey} used this month`,
        };
      }

      return {
        tenantId,
        periodStart,
        periodEnd,
        features,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get usage summary for tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve usage summary',
      );
    }
  }

  /**
   * Get current usage count for a feature in the current period
   */
  async getCurrentUsage(tenantId: string, featureKey: string): Promise<number> {
    try {
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod();

      const result = await this.databaseService.query(
        `SELECT usage_count FROM public.tenant_usage
         WHERE tenant_id = $1 AND feature_key = $2 AND period_start = $3 AND period_end = $4`,
        [tenantId, featureKey, periodStart, periodEnd],
      );

      return result.rows.length > 0
        ? (result.rows[0].usage_count as number)
        : 0;
    } catch (error) {
      this.logger.error(
        `Failed to get current usage for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve current usage',
      );
    }
  }

  /**
   * Get usage history for a tenant
   */
  async getUsageHistory(
    tenantId: string,
    options?: {
      featureKey?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    },
  ): Promise<{ events: UsageEvent[]; total: number }> {
    try {
      const limit = options?.limit ?? 50;
      const conditions: string[] = ['tenant_id = $1'];
      const params: (string | Date | number | null)[] = [tenantId];
      let paramIndex = 2;

      if (options?.featureKey) {
        conditions.push(`feature_key = $${paramIndex}`);
        params.push(options.featureKey);
        paramIndex++;
      }

      if (options?.startDate) {
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(options.startDate);
        paramIndex++;
      }

      if (options?.endDate) {
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(options.endDate);
        paramIndex++;
      }

      params.push(limit);

      const countResult = await this.databaseService.query(
        `SELECT COUNT(*) as total FROM public.tenant_usage_events WHERE ${conditions.join(' AND ')}`,
        params.slice(0, -1),
      );

      const result = await this.databaseService.query(
        `SELECT * FROM public.tenant_usage_events
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${paramIndex}`,
        params,
      );

      return {
        events: result.rows.map((row) =>
          mapUsageEventRow(row as UsageEventRow),
        ),
        total: parseInt(String(countResult.rows[0]?.total ?? '0'), 10),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get usage history for tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve usage history',
      );
    }
  }

  /**
   * Get usage record for a specific feature and period
   */
  async getUsageRecord(
    tenantId: string,
    featureKey: string,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<TenantUsage | null> {
    try {
      const start = periodStart ?? this.getCurrentBillingPeriod().periodStart;
      const end = periodEnd ?? this.getCurrentBillingPeriod().periodEnd;

      const result = await this.databaseService.query(
        `SELECT * FROM public.tenant_usage
         WHERE tenant_id = $1 AND feature_key = $2 AND period_start = $3 AND period_end = $4`,
        [tenantId, featureKey, start, end],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapUsageRow(result.rows[0] as TenantUsageRow);
    } catch (error) {
      this.logger.error(
        `Failed to get usage record for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException('Failed to retrieve usage record');
    }
  }

  /**
   * Reset usage for a specific feature (admin operation)
   */
  async resetUsage(
    tenantId: string,
    featureKey: string,
    reason?: string,
  ): Promise<void> {
    try {
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod();

      await this.databaseService.transaction(async (client) => {
        await client.query(
          `UPDATE public.tenant_usage
           SET usage_count = 0, updated_at = now()
           WHERE tenant_id = $1 AND feature_key = $2 AND period_start = $3 AND period_end = $4`,
          [tenantId, featureKey, periodStart, periodEnd],
        );

        await client.query(
          `INSERT INTO public.tenant_usage_events
            (tenant_id, feature_key, user_id, event_type, delta, metadata)
           VALUES ($1, $2, NULL, 'reset', 0, $3)`,
          [
            tenantId,
            featureKey,
            JSON.stringify({
              reason: reason || 'Manual reset',
              reset_at: new Date().toISOString(),
            }),
          ],
        );
      });

      this.logger.log(
        `Usage reset for tenant ${tenantId}, feature: ${featureKey}, reason: ${reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to reset usage for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException('Failed to reset usage');
    }
  }

  /**
   * Get usage records for all features in current period
   */
  async getAllUsageRecords(
    tenantId: string,
  ): Promise<Record<string, TenantUsage>> {
    try {
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod();

      const result = await this.databaseService.query(
        `SELECT * FROM public.tenant_usage
         WHERE tenant_id = $1 AND period_start = $2 AND period_end = $3`,
        [tenantId, periodStart, periodEnd],
      );

      const records: Record<string, TenantUsage> = {};
      for (const row of result.rows) {
        const usage = mapUsageRow(row as TenantUsageRow);
        records[usage.featureKey] = usage;
      }

      return records;
    } catch (error) {
      this.logger.error(
        `Failed to get all usage records for tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve usage records',
      );
    }
  }

  /**
   * Reset usage for all metered features for a tenant
   */
  async resetTenantUsage(tenantId: string): Promise<void> {
    try {
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod();

      await this.databaseService.transaction(async (client) => {
        await client.query(
          `UPDATE public.tenant_usage
           SET usage_count = 0, updated_at = now()
           WHERE tenant_id = $1 AND period_start = $2 AND period_end = $3`,
          [tenantId, periodStart, periodEnd],
        );

        await client.query(
          `INSERT INTO public.tenant_usage_events
            (tenant_id, feature_key, user_id, event_type, delta, metadata)
           VALUES ($1, 'all_features', NULL, 'reset', 0, $2)`,
          [
            tenantId,
            JSON.stringify({
              reason: 'Monthly usage reset',
              reset_at: new Date().toISOString(),
            }),
          ],
        );
      });

      this.logger.log(`Reset all metered features for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(
        `Failed to reset all metered features for tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to reset usage');
    }
  }

  /**
   * Find tenants whose billing period ended yesterday (today is new period start)
   */
  async findTenantsWithResetDueToday(): Promise<string[]> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      // Find active tenants that have usage records where period_end = yesterday
      // This means today is the first day of their new billing period
      const result = await this.databaseService.query(
        `SELECT DISTINCT tu.tenant_id
         FROM public.tenant_usage tu
         INNER JOIN public.tenants t ON tu.tenant_id = t.id
         WHERE t.status = 'active'
           AND DATE(tu.period_end) = DATE($1)`,
        [yesterday],
      );

      return result.rows.map((row) => row.tenant_id);
    } catch (error) {
      this.logger.error('Failed to find tenants with reset due today', error);
      throw new InternalServerErrorException(
        'Failed to find tenants for reset',
      );
    }
  }
}
