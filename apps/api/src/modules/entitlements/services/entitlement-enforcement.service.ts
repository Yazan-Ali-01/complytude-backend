import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { getFeatureDefinition } from '../../../common/constants/plan-entitlements.constant';
import {
  EffectiveEntitlement,
  EntitlementCheckResult,
  FeatureKey,
} from '../../../common/types/entitlement.types';
import { DatabaseService } from '../../../database/database.service';
import { QueryOptions } from '../../../repositories/base/repository.interface';
import { DomainEventsRepository } from '../../../repositories/domain-events/domain-events.repository';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { SubscriptionsRepository } from '../../../repositories/subscriptions/subscriptions.repository';
import { CreditLedgerService } from './credit-ledger.service';
import { EntitlementResolverService } from './entitlement-resolver.service';
import { UsageIngestionService } from './usage-ingestion.service';
import { UsageProjectionService } from './usage-projection.service';

/**
 * Entitlement Enforcement Service
 *
 * Core service for runtime entitlement enforcement with credit fallback.
 *
 * Key responsibilities:
 * - Check if tenant can use a feature (quota enforcement)
 * - Fallback to credits if quota is exceeded (for creditable features)
 * - Record usage with source attribution (plan, addon, credit, override)
 * - Emit domain events for denials and credit deductions
 *
 * Architecture:
 * - All operations run in a single transaction for atomicity
 * - Calls resolver, usage projection, credit ledger within the transaction
 * - Returns structured result for guard/controller consumption
 *
 * Flow:
 * 1. Resolve effective entitlement
 * 2. For boolean features: simple check
 * 3. For quota features: check usage vs limit
 * 4. If exceeded: check credit balance and deduct if available
 * 5. Record usage with source attribution
 * 6. Emit domain events
 *
 * TODO: BullMQ - After denial, emit quota.exceeded event to queue for
 * async notification (email/webhook to tenant admin with upgrade prompt).
 */
@Injectable()
export class EntitlementEnforcementService {
  private readonly logger = new Logger(EntitlementEnforcementService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly entitlementResolver: EntitlementResolverService,
    private readonly usageProjectionService: UsageProjectionService,
    private readonly usageIngestionService: UsageIngestionService,
    private readonly creditLedgerService: CreditLedgerService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly domainEventsRepository: DomainEventsRepository,
    private readonly featuresRepository: FeaturesRepository,
  ) {}

  /**
   * Check entitlement and record usage (with credit fallback if applicable)
   *
   * This is the main entry point for runtime enforcement. It orchestrates:
   * 1. Entitlement resolution
   * 2. Usage quota checking
   * 3. Credit fallback for creditable features
   * 4. Usage recording with source attribution
   * 5. Domain event emission
   *
   * All operations run in a single transaction for atomicity.
   *
   * @param tenantId - Tenant ID
   * @param featureKey - Feature key to check and record
   * @param userId - User ID (optional)
   * @param units - Number of units to consume (default 1)
   * @param metadata - Additional metadata for usage event
   * @param options - Query options (optional client for shared transactions)
   * @returns Check result with allowed flag, source, and remaining info
   */
  async checkAndRecord(
    tenantId: string,
    featureKey: FeatureKey,
    userId?: string,
    units: number = 1,
    metadata?: Record<string, any>,
    options?: QueryOptions,
  ): Promise<EntitlementCheckResult> {
    this.logger.debug(
      `Checking and recording: tenant=${tenantId}, feature=${featureKey}, units=${units}`,
    );

    const execute = async (client: PoolClient) => {
      // Step 1: Resolve effective entitlement
      const entitlement = await this.entitlementResolver.resolveForTenant(
        tenantId,
        featureKey,
        { client },
      );

      if (!entitlement) {
        this.logger.warn(
          `Feature not found: ${featureKey} for tenant ${tenantId}`,
        );
        throw new NotFoundException(`Feature not found: ${featureKey}`);
      }

      // Step 2: Handle boolean features (no usage tracking)
      if (entitlement.feature_type === 'boolean') {
        const allowed = entitlement.value_bool === true;
        return {
          allowed,
          source: entitlement.source,
        };
      }

      // Step 3: Handle quota/metered/capacity features
      if (
        entitlement.feature_type === 'quota' ||
        entitlement.feature_type === 'metered' ||
        entitlement.feature_type === 'capacity'
      ) {
        return this.enforceQuotaFeature(
          tenantId,
          featureKey,
          entitlement,
          userId,
          units,
          metadata,
          client,
        );
      }

      // Step 4: Handle rate_limit features (future implementation)
      if (entitlement.feature_type === 'rate_limit') {
        // TODO: Implement rate limit enforcement
        // For now, treat as unlimited
        this.logger.warn(
          `Rate limit enforcement not yet implemented for ${featureKey}`,
        );
        return {
          allowed: true,
          source: entitlement.source,
        };
      }

      // Default: allow
      return {
        allowed: true,
        source: entitlement.source,
      };
    };

    if (options?.client) {
      return execute(options.client);
    }
    return this.databaseService.transactionWithTenantContext(tenantId, execute);
  }

  /**
   * Enforce quota/metered/capacity feature with credit fallback
   *
   * @param tenantId - Tenant ID
   * @param featureKey - Feature key
   * @param entitlement - Resolved entitlement
   * @param userId - User ID (optional)
   * @param units - Number of units to consume
   * @param metadata - Additional metadata
   * @param client - Transaction client
   * @returns Check result
   */
  private async enforceQuotaFeature(
    tenantId: string,
    featureKey: FeatureKey,
    entitlement: EffectiveEntitlement,
    userId: string | undefined,
    units: number,
    metadata: Record<string, any> | undefined,
    client: PoolClient,
  ): Promise<EntitlementCheckResult> {
    // Get subscription for billing period
    const subscription = await this.subscriptionsRepository.findActiveByTenant(
      tenantId,
      {
        client,
      },
    );

    if (!subscription) {
      throw new NotFoundException(
        `No active subscription for tenant: ${tenantId}`,
      );
    }

    // Get current usage
    const usage = await this.usageProjectionService.getCurrentUsage(
      tenantId,
      subscription.id,
      featureKey,
      { client },
    );

    const limit = entitlement.value_int ?? 0;
    const used = usage?.total_units ?? 0;

    // Handle unlimited (-1)
    if (limit === -1) {
      await this.usageIngestionService.recordUsage(
        {
          tenant_id: tenantId,
          feature_key: featureKey,
          user_id: userId,
          units,
          source: 'plan',
          metadata,
        },
        { client },
      );

      return {
        allowed: true,
        source: 'plan',
        remaining: -1,
        limit: -1,
        used,
      };
    }

    const remaining = limit - used;

    // Within quota: record with plan source
    if (remaining >= units) {
      await this.usageIngestionService.recordUsage(
        {
          tenant_id: tenantId,
          feature_key: featureKey,
          user_id: userId,
          units,
          source: 'plan',
          metadata,
        },
        { client },
      );

      return {
        allowed: true,
        source: 'plan',
        remaining: remaining - units,
        limit,
        used: used + units,
      };
    }

    // TODO: DISCUSSION - Partial Credit Fallback Strategy
    //
    // Current Behavior: "All-or-Nothing" Credit Fallback
    // ===================================================
    // When plan quota is exceeded, the ENTIRE request is fulfilled using credits.
    //
    // Example:
    //   - Plan remaining: 1 unit
    //   - Request: 5 units
    //   - Result: Deduct 5 credits, plan usage stays at current level
    //   - Credits remaining: 20 - 5 = 15
    //
    // Pros:
    //   ✅ Simpler implementation (single source per request)
    //   ✅ Cleaner usage ledger (one entry per request)
    //   ✅ Easier to reason about and audit
    //   ✅ No mixed-source transactions
    //
    // Cons:
    //   ❌ Doesn't maximize plan quota utilization
    //   ❌ Less cost-effective for tenants (wastes remaining plan units)
    //   ❌ May feel unfair to users who expect to use remaining quota first
    //
    // Alternative: "Partial Credit Fallback" (NOT IMPLEMENTED)
    // =========================================================
    // Use remaining plan quota first, then fill the gap with credits.
    //
    // Example:
    //   - Plan remaining: 1 unit
    //   - Request: 5 units
    //   - Result: Use 1 from plan + deduct 4 credits
    //   - Credits remaining: 20 - 4 = 16
    //
    // Pros:
    //   ✅ Maximizes plan quota utilization
    //   ✅ More cost-effective for tenants
    //   ✅ Better user experience (feels fairer)
    //   ✅ Reduces credit consumption
    //
    // Cons:
    //   ❌ More complex implementation (split transactions)
    //   ❌ Two usage ledger entries per request (plan + credit)
    //   ❌ Harder to audit and reason about
    //   ❌ Need to handle partial failures (what if credit deduction fails?)
    //   ❌ Response source becomes ambiguous (plan? credit? both?)
    //   ❌ Complicates usage analytics and reporting
    //
    // Implementation Considerations for Partial Fallback:
    // ====================================================
    // 1. Split the request into two parts:
    //    - planUnits = Math.min(remaining, units)
    //    - creditUnits = units - planUnits
    //
    // 2. Record two usage entries:
    //    - First: recordUsage(planUnits, source='plan')
    //    - Second: recordUsage(creditUnits, source='credit')
    //
    // 3. Handle edge cases:
    //    - What if credit deduction fails after plan usage is recorded?
    //    - Should we rollback the plan usage? (transaction handles this)
    //    - What source do we return in the result? ('mixed'? 'plan+credit'?)
    //
    // 4. Update response structure:
    //    - Add planUnitsUsed and creditUnitsUsed fields
    //    - Or add a new source type: 'mixed' or 'plan+credit'
    //
    // 5. Update usage analytics queries:
    //    - Aggregation logic needs to handle split requests
    //    - Reporting becomes more complex
    //
    // Decision Required:
    // ==================
    // Choose based on business priorities:
    // - If simplicity and auditability are paramount → Keep current approach
    // - If tenant cost optimization is paramount → Implement partial fallback
    //
    // Recommendation: Keep current approach unless tenants explicitly request
    // partial fallback. The complexity cost may outweigh the benefit.

    // Exceeded: check if feature is creditable
    const featureDef = getFeatureDefinition(featureKey);
    if (!featureDef?.creditable) {
      // Not creditable: deny
      await this.emitDenialEvent(
        tenantId,
        featureKey,
        userId,
        units,
        limit,
        used,
        'not_creditable',
        client,
      );

      return {
        allowed: false,
        reason: 'quota_exceeded',
        limit,
        used,
      };
    }

    // Creditable: check credit balance
    const creditBalance = await this.creditLedgerService.getBalance(tenantId, {
      client,
    });
    const creditCost = units * 1; // 1:1 ratio for now

    if (creditBalance < creditCost) {
      // Insufficient credits: deny
      await this.emitDenialEvent(
        tenantId,
        featureKey,
        userId,
        units,
        limit,
        used,
        'insufficient_credits',
        client,
      );

      return {
        allowed: false,
        reason: 'quota_exceeded',
        limit,
        used,
        creditsRemaining: creditBalance,
      };
    }

    // Deduct credits and record usage
    const feature = await this.featuresRepository.findByKey(featureKey, {
      client,
    });

    await this.creditLedgerService.deduct(
      tenantId,
      creditCost,
      feature?.id,
      undefined, // usage_ledger_id will be linked after recording
      { ...metadata, credit_fallback: true },
      { client },
    );

    await this.usageIngestionService.recordUsage(
      {
        tenant_id: tenantId,
        feature_key: featureKey,
        user_id: userId,
        units,
        source: 'credit',
        metadata: { ...metadata, credit_cost: creditCost },
      },
      { client },
    );

    this.logger.log(
      `Credit fallback: tenant=${tenantId}, feature=${featureKey}, cost=${creditCost}, remaining=${creditBalance - creditCost}`,
    );

    return {
      allowed: true,
      source: 'credit',
      creditsRemaining: creditBalance - creditCost,
      limit,
      used: used + units,
    };
  }

  /**
   * Emit entitlement denial event
   *
   * @param tenantId - Tenant ID
   * @param featureKey - Feature key
   * @param userId - User ID (optional)
   * @param units - Requested units
   * @param limit - Entitlement limit
   * @param used - Current usage
   * @param reason - Denial reason
   * @param client - Transaction client
   */
  private async emitDenialEvent(
    tenantId: string,
    featureKey: FeatureKey,
    userId: string | undefined,
    units: number,
    limit: number,
    used: number,
    reason: string,
    client: PoolClient,
  ): Promise<void> {
    await this.domainEventsRepository.emit(
      {
        tenant_id: tenantId,
        event_type: 'entitlement.denied',
        aggregate_type: 'entitlement',
        aggregate_id: tenantId,
        actor_id: userId,
        actor_type: userId ? 'user' : 'system',
        payload: JSON.stringify({
          feature_key: featureKey,
          requested_units: units,
          limit,
          used,
          remaining: limit - used,
          reason,
        }),
        metadata: JSON.stringify({
          timestamp: new Date().toISOString(),
        }),
      },
      { client },
    );

    // TODO: BullMQ - Emit quota.exceeded event to queue for async notification
    // (email/webhook to tenant admin with upgrade prompt)
  }
}
