import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { TenantFeatures, PlanType, UsageWithCreditsResult, ActiveOverride, FeatureOverride } from './entities/tenant.entity';
import {
  getDefaultPlanFeatures,
  isValidPlan,
  CREDIT_PRICES,
  USAGE_TRACKED_FEATURES,
} from '../../config/plan-features.config';

export interface UsageCheckResult {
  allowed: boolean;
  current_usage: number;
  usage_limit: number;
  remaining: number;
}

export interface UsageSummary {
  [featureKey: string]: UsageCheckResult;
}

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Get default features for a specific plan
   */
  getDefaultFeatures(plan: PlanType): TenantFeatures {
    return getDefaultPlanFeatures(plan);
  }

  /**
   * Get tenant's effective features (plan defaults merged with active overrides)
   * Active overrides from the database override default plan features
   */
  async getTenantFeatures(tenantId: string): Promise<TenantFeatures> {
    try {
      this.logger.debug(`Getting features for tenant: ${tenantId}`);

      // 1. Get tenant plan
      const tenantResult = await this.databaseService.query(
        'SELECT plan FROM public.tenants WHERE tenant_id = $1 AND is_active = true',
        [tenantId],
      );

      if (tenantResult.rows.length === 0) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

      const { plan } = tenantResult.rows[0];

      // Validate plan type
      const planValue = String(plan);
      if (!isValidPlan(planValue)) {
        this.logger.error(`Invalid plan "${planValue}" for tenant ${tenantId}`);
        throw new InternalServerErrorException('Invalid tenant plan');
      }

      // 2. Get plan defaults
      const planDefaults = this.getDefaultFeatures(planValue);

      // 3. Get active normalized overrides (exclude expired and revoked)
      const overridesResult = await this.databaseService.query(
        'SELECT feature_key, override_value FROM public.get_active_overrides($1)',
        [tenantId],
      );

      // 4. Merge: plan_defaults <- active_overrides
      const effectiveFeatures: TenantFeatures = { ...planDefaults };

      for (const override of overridesResult.rows) {
        effectiveFeatures[override.feature_key] = override.override_value;
      }

      this.logger.debug(
        `Tenant ${tenantId} effective features merged from ${overridesResult.rows.length} overrides`,
      );

      return effectiveFeatures;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(`Failed to get features for tenant ${tenantId}`, error);
      throw new InternalServerErrorException('Failed to retrieve features');
    }
  }

  /**
   * Check if a tenant has access to a specific feature
   */
  async checkFeatureAccess(
    tenantId: string,
    featureName: string,
  ): Promise<boolean> {
    try {
      const features = await this.getTenantFeatures(tenantId);

      // Check if feature exists and is enabled
      if (featureName in features) {
        const featureValue = features[featureName];

        // For boolean features, return the value
        if (typeof featureValue === 'boolean') {
          return featureValue;
        }

        // For numeric features (like document_limit), consider them "enabled" if > 0 or -1 (unlimited)
        if (typeof featureValue === 'number') {
          return featureValue !== 0;
        }

        // For other types, consider them enabled if truthy
        return !!featureValue;
      }

      // Feature not found, deny access
      this.logger.warn(
        `Feature "${featureName}" not found for tenant ${tenantId}`,
      );
      return false;
    } catch (error) {
      this.logger.error(
        `Error checking feature access for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get the document limit for a tenant
   * Returns -1 for unlimited, 0 for no access, or positive number for limit
   */
  async getDocumentLimit(tenantId: string): Promise<number> {
    try {
      const features = await this.getTenantFeatures(tenantId);
      // Use nullish coalescing to only default to 0 if undefined/null, not if explicitly 0
      return features.documents_per_month ?? 0;
    } catch (error) {
      this.logger.error(
        `Error getting document limit for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if tenant can upload more documents based on their limit
   */
  async checkDocumentLimit(
    tenantId: string,
    currentCount: number,
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    try {
      const limit = await this.getDocumentLimit(tenantId);

      // -1 means unlimited
      if (limit === -1) {
        return { allowed: true, limit, current: currentCount };
      }

      // Check if current count is below limit
      const allowed = currentCount < limit;

      return { allowed, limit, current: currentCount };
    } catch (error) {
      this.logger.error(
        `Error checking document limit for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  async checkUsageLimit(
    tenantId: string,
    featureKey: string,
  ): Promise<UsageCheckResult> {
    try {
      const features = await this.getTenantFeatures(tenantId);
      const limit = features[featureKey] as number;

      if (limit === undefined || limit === null) {
        this.logger.warn(
          `Feature ${featureKey} not found for tenant ${tenantId}`,
        );
        return { allowed: false, current_usage: 0, usage_limit: 0, remaining: 0 };
      }

      if (limit === -1) {
        return { allowed: true, current_usage: 0, usage_limit: -1, remaining: -1 };
      }

      const billingPeriod = await this.getBillingPeriod();
      const result = await this.databaseService.query(
        `SELECT current_usage, usage_limit FROM public.tenant_usage
         WHERE tenant_id = $1 AND feature_key = $2 AND billing_period_start = $3`,
        [tenantId, featureKey, billingPeriod.start],
      );

      const currentUsage = result.rows[0]?.current_usage || 0;
      const remaining = Math.max(0, limit - currentUsage);

      return {
        allowed: currentUsage < limit,
        current_usage: currentUsage,
        usage_limit: limit,
        remaining,
      };
    } catch (error) {
      this.logger.error(
        `Error checking usage limit for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw error;
    }
  }

  async incrementUsage(
    tenantId: string,
    featureKey: string,
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<{ success: boolean; result: UsageCheckResult }> {
    try {
      const features = await this.getTenantFeatures(tenantId);
      const limit = features[featureKey] as number;

      const billingPeriod = await this.getBillingPeriod();

      await this.databaseService.query(
        `INSERT INTO public.tenant_usage (tenant_id, feature_key, billing_period_start, billing_period_end, current_usage, usage_limit)
         VALUES ($1, $2, $3, $4, 0, $5)
         ON CONFLICT (tenant_id, feature_key, billing_period_start) DO NOTHING`,
        [tenantId, featureKey, billingPeriod.start, billingPeriod.end, limit],
      );

      const check = await this.checkUsageLimit(tenantId, featureKey);
      if (!check.allowed) {
        return { success: false, result: check };
      }

      const result = await this.databaseService.query(
        `UPDATE public.tenant_usage
         SET current_usage = current_usage + 1, last_usage_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND feature_key = $2 AND billing_period_start = $3
         RETURNING current_usage, usage_limit`,
        [tenantId, featureKey, billingPeriod.start],
      );

      await this.databaseService.query(
        `INSERT INTO public.tenant_usage_log (tenant_id, feature_key, action, previous_value, new_value, delta, user_id, metadata)
         VALUES ($1, $2, 'increment', $3, $4, 1, $5, $6)`,
        [
          tenantId,
          featureKey,
          check.current_usage,
          check.current_usage + 1,
          userId,
          JSON.stringify(metadata || {}),
        ],
      );

      const newUsage = result.rows[0];
      return {
        success: true,
        result: {
          allowed: newUsage.usage_limit === -1 || newUsage.current_usage < newUsage.usage_limit,
          current_usage: newUsage.current_usage,
          usage_limit: newUsage.usage_limit,
          remaining: newUsage.usage_limit === -1 ? -1 : Math.max(0, newUsage.usage_limit - newUsage.current_usage),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error incrementing usage for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw error;
    }
  }

  async getUsageSummary(tenantId: string): Promise<UsageSummary> {
    try {
      const summary: UsageSummary = {};

      for (const feature of USAGE_TRACKED_FEATURES) {
        summary[feature] = await this.checkUsageLimit(tenantId, feature);
      }

      return summary;
    } catch (error) {
      this.logger.error(
        `Error getting usage summary for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  private async getBillingPeriod(): Promise<{ start: Date; end: Date }> {
    const result = await this.databaseService.query(
      `SELECT
         DATE_TRUNC('month', CURRENT_DATE)::DATE as period_start,
         (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE as period_end`,
    );

    const { period_start, period_end } = result.rows[0];
    return { start: period_start, end: period_end };
  }

  async getCreditsBalance(tenantId: string, featureKey: string): Promise<number> {
    try {
      const result = await this.databaseService.query(
        'SELECT public.get_credits_balance($1, $2) as balance',
        [tenantId, featureKey],
      );
      return result.rows[0]?.balance ?? 0;
    } catch (error) {
      this.logger.error(
        `Error getting credits balance for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw error;
    }
  }

  async getAllCreditsBalances(tenantId: string): Promise<Record<string, number>> {
    try {
      const result = await this.databaseService.query(
        'SELECT feature_key, credits_remaining FROM public.tenant_credits WHERE tenant_id = $1',
        [tenantId],
      );

      const balances: Record<string, number> = {};
      for (const row of result.rows) {
        balances[row.feature_key] = row.credits_remaining;
      }
      return balances;
    } catch (error) {
      this.logger.error(
        `Error getting all credits balances for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  async checkUsageWithCredits(tenantId: string, featureKey: string): Promise<UsageWithCreditsResult> {
    try {
      const features = await this.getTenantFeatures(tenantId);
      const limit = features[featureKey] as number;

      if (limit === undefined || limit === null) {
        return {
          allowed: false,
          source: 'none',
          current_usage: 0,
          usage_limit: 0,
          remaining_quota: 0,
          credits_available: 0,
        };
      }

      // SQL function check_usage_with_credits takes only 2 params (tenant_id, feature_key)
      // It internally calls check_usage_limit and get_credits_balance
      const result = await this.databaseService.query(
        'SELECT * FROM public.check_usage_with_credits($1, $2)',
        [tenantId, featureKey],
      );

      return result.rows[0] || {
        allowed: false,
        source: 'none',
        current_usage: 0,
        usage_limit: 0,
        remaining_quota: 0,
        credits_available: 0,
      };
    } catch (error) {
      this.logger.error(
        `Error checking usage with credits for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw error;
    }
  }

  async consumeUsageOrCredits(
    tenantId: string,
    featureKey: string,
    creditsNeeded: number = 1,
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<{ success: boolean; source: 'quota' | 'credits'; result: UsageWithCreditsResult }> {
    try {
      const check = await this.checkUsageWithCredits(tenantId, featureKey);

      if (!check.allowed) {
        return { success: false, source: 'quota', result: check };
      }

      if (check.source === 'quota') {
        await this.incrementUsage(tenantId, featureKey, userId, metadata);
        const newCheck = await this.checkUsageWithCredits(tenantId, featureKey);
        return { success: true, source: 'quota', result: newCheck };
      }

      if (check.source === 'credits') {
        const deductResult = await this.databaseService.query(
          'SELECT * FROM public.deduct_credits($1, $2, $3, $4, $5)',
          [tenantId, featureKey, creditsNeeded, userId, JSON.stringify(metadata || {})],
        );

        if (!deductResult.rows[0]?.success) {
          return { success: false, source: 'credits', result: check };
        }

        const newCheck = await this.checkUsageWithCredits(tenantId, featureKey);
        return { success: true, source: 'credits', result: newCheck };
      }

      return { success: false, source: 'quota', result: check };
    } catch (error) {
      this.logger.error(
        `Error consuming usage or credits for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw error;
    }
  }

  async addCredits(
    tenantId: string,
    featureKey: string,
    credits: number,
    purchasedBy?: string,
    stripePaymentIntentId?: string,
  ): Promise<{ new_balance: number; purchase_id?: string }> {
    try {
      const balanceResult = await this.databaseService.query(
        'SELECT public.add_credits($1, $2, $3) as new_balance',
        [tenantId, featureKey, credits],
      );

      const pricePerCredit = CREDIT_PRICES[featureKey as keyof typeof CREDIT_PRICES] ?? 0;

      const purchaseResult = await this.databaseService.query(
        `INSERT INTO public.credit_purchases
         (tenant_id, feature_key, credits_purchased, price_aed, stripe_payment_intent_id, purchased_by, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          tenantId,
          featureKey,
          credits,
          credits * pricePerCredit,
          stripePaymentIntentId,
          purchasedBy,
          stripePaymentIntentId ? 'completed' : 'pending',
        ],
      );

      this.logger.log(`Credits added: ${credits} for ${featureKey} to tenant ${tenantId}`);

      return {
        new_balance: balanceResult.rows[0].new_balance,
        purchase_id: purchaseResult.rows[0]?.id,
      };
    } catch (error) {
      this.logger.error(
        `Error adding credits for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw error;
    }
  }

  async getCreditHistory(tenantId: string, featureKey?: string): Promise<any[]> {
    try {
      let query = `
        SELECT * FROM public.credit_purchases
        WHERE tenant_id = $1
      `;
      const params: any[] = [tenantId];

      if (featureKey) {
        query += ` AND feature_key = $2`;
        params.push(featureKey);
      }

      query += ` ORDER BY purchased_at DESC`;

      const result = await this.databaseService.query(query, params);
      return result.rows;
    } catch (error) {
      this.logger.error(
        `Error getting credit history for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  async getActiveOverrides(tenantId: string): Promise<ActiveOverride[]> {
    try {
      const result = await this.databaseService.query(
        'SELECT * FROM public.get_active_overrides($1)',
        [tenantId],
      );
      return result.rows;
    } catch (error) {
      this.logger.error(
        `Error getting active overrides for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  async grantOverride(
    tenantId: string,
    featureKey: string,
    overrideValue: boolean | number | string | string[],
    reason: string,
    grantedByUserId: string,
    expiresAtStr?: string,
  ): Promise<FeatureOverride> {
    try {
      // Validate feature key exists in features table
      const featureCheck = await this.databaseService.query(
        'SELECT key FROM public.features WHERE key = $1 AND is_active = true',
        [featureKey],
      );

      if (featureCheck.rows.length === 0) {
        throw new BadRequestException(`Invalid feature key: ${featureKey}`);
      }

      // Revoke existing active override for this feature
      await this.databaseService.query(
        `UPDATE public.tenant_feature_overrides
         SET revoked_at = now(), revoked_by = $1, revoke_reason = 'Superseded by new override'
         WHERE tenant_id = $2 AND feature_key = $3 AND revoked_at IS NULL`,
        [grantedByUserId, tenantId, featureKey],
      );

      // Insert new override
      const result = await this.databaseService.query(
        `INSERT INTO public.tenant_feature_overrides
         (tenant_id, feature_key, override_value, reason, granted_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          tenantId,
          featureKey,
          JSON.stringify(overrideValue),
          reason,
          grantedByUserId,
          expiresAtStr || null,
        ],
      );

      this.logger.log(
        `Override granted: ${featureKey} for tenant ${tenantId} by ${grantedByUserId}`,
      );

      return result.rows[0];
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Error granting override for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException('Failed to grant override');
    }
  }

  async revokeOverride(
    tenantId: string,
    featureKey: string,
    reason: string,
    revokedByUserId: string,
  ): Promise<FeatureOverride> {
    try {
      const result = await this.databaseService.query(
        `UPDATE public.tenant_feature_overrides
         SET revoked_at = now(), revoked_by = $1, revoke_reason = $2
         WHERE tenant_id = $3 AND feature_key = $4 AND revoked_at IS NULL
         RETURNING *`,
        [revokedByUserId, reason, tenantId, featureKey],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`No active override found for ${featureKey}`);
      }

      this.logger.log(
        `Override revoked: ${featureKey} for tenant ${tenantId} by ${revokedByUserId}`,
      );

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error revoking override for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException('Failed to revoke override');
    }
  }
}
