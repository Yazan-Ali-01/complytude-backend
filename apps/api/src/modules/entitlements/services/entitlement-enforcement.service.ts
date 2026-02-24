import {
  ENTITLEMENT_JOB_NAMES,
  EntitlementProjectionUpdateJobData,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
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
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { SubscriptionsRepository } from '../../../repositories/subscriptions/subscriptions.repository';
import { CreditLedgerService } from './credit-ledger.service';
import { DomainEventsService } from './domain-events.service';
import { EntitlementResolverService } from './entitlement-resolver.service';
import { UsageIngestionService } from './usage-ingestion.service';
import { UsageProjectionService } from './usage-projection.service';

interface EnforceResult {
  result: EntitlementCheckResult;
  projectionJob?: EntitlementProjectionUpdateJobData;
}

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
    private readonly domainEventsService: DomainEventsService,
    private readonly featuresRepository: FeaturesRepository,
    private readonly queueProducer: QueueProducerService,
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

    const execute = async (client: PoolClient): Promise<EnforceResult> => {
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
          result: {
            allowed,
            source: entitlement.source,
          },
        };
      }

      // Step 3: Handle quota/metered/capacity features
      if (
        entitlement.feature_type === 'quota' ||
        entitlement.feature_type === 'metered' ||
        entitlement.feature_type === 'capacity'
      ) {
        return this.enforceUsageBasedFeature(
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
          result: {
            allowed: true,
            source: entitlement.source,
          },
        };
      }

      // Default: allow
      return {
        result: {
          allowed: true,
          source: entitlement.source,
        },
      };
    };

    const { result, projectionJob } = options?.client
      ? await execute(options.client)
      : await this.databaseService.transactionWithTenantContext(
          { tenantId },
          execute,
        );

    // Post-commit: enqueue projection update (fire-and-forget, with sync fallback)
    if (projectionJob) {
      await this.enqueueProjectionUpdate(projectionJob);
    }

    return result;
  }

  /**
   * Router for usage-based enforcement modes.
   *
   * COM-133 uses async projection updates for all usage checks.
   * COM-134 will add strict-mode routing for near-limit requests.
   */
  private async enforceUsageBasedFeature(
    tenantId: string,
    featureKey: FeatureKey,
    entitlement: EffectiveEntitlement,
    userId: string | undefined,
    units: number,
    metadata: Record<string, any> | undefined,
    client: PoolClient,
  ): Promise<EnforceResult> {
    // TODO(COM-134): Add strict mode threshold check here.
    // For now, always route to the async path.
    return this.enforceUsageAsync(
      tenantId,
      featureKey,
      entitlement,
      userId,
      units,
      metadata,
      client,
    );
  }

  /**
   * Enforce quota/metered/capacity feature with credit fallback
   * using the async projection path.
   *
   * Returns EnforceResult with both the check result and optional projection
   * job data for async processing after commit.
   *
   * @param tenantId - Tenant ID
   * @param featureKey - Feature key
   * @param entitlement - Resolved entitlement
   * @param userId - User ID (optional)
   * @param units - Number of units to consume
   * @param metadata - Additional metadata
   * @param client - Transaction client
   * @returns EnforceResult with result and optional projection job
   */
  private async enforceUsageAsync(
    tenantId: string,
    featureKey: FeatureKey,
    entitlement: EffectiveEntitlement,
    userId: string | undefined,
    units: number,
    metadata: Record<string, any> | undefined,
    client: PoolClient,
  ): Promise<EnforceResult> {
    // Get subscription for billing period
    const subscription = await this.subscriptionsRepository.findActiveByTenant(
      tenantId,
      { client },
    );

    if (!subscription) {
      throw new NotFoundException(
        `No active subscription for tenant: ${tenantId}`,
      );
    }

    // Get feature (needed for projection job payload)
    const feature = await this.featuresRepository.findByKey(featureKey, {
      client,
    });
    if (!feature) {
      throw new NotFoundException(`Feature not found: ${featureKey}`);
    }

    const billingPeriod = this.deriveBillingPeriod(
      subscription.current_period_start,
    );

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
      const usageEvent = await this.usageIngestionService.recordUsage(
        {
          tenant_id: tenantId,
          feature_key: featureKey,
          user_id: userId,
          units,
          allocations: [{ source: 'plan', units }],
          metadata,
        },
        { client },
      );

      return {
        result: {
          allowed: true,
          source: 'plan',
          allocations: [{ source: 'plan', units }],
          remaining: -1,
          limit: -1,
          used,
        },
        projectionJob: {
          usageLedgerId: usageEvent.id,
          tenantId,
          featureKey,
          featureId: feature.id,
          featureName: feature.name,
          featureType: feature.feature_type,
          subscriptionId: subscription.id,
          units,
          billingPeriod,
          allocations: [{ source: 'plan', units }],
          resourceType: usageEvent.resource_type,
          resourceId: usageEvent.resource_id,
          actorId: userId,
          recordedAt: usageEvent.recorded_at.toISOString(),
          idempotencyKey: usageEvent.idempotency_key,
          creditDeducted: false,
        },
      };
    }

    const remaining = limit - used;

    // Within quota: record with plan source
    if (remaining >= units) {
      const usageEvent = await this.usageIngestionService.recordUsage(
        {
          tenant_id: tenantId,
          feature_key: featureKey,
          user_id: userId,
          units,
          allocations: [{ source: 'plan', units }],
          metadata,
        },
        { client },
      );

      return {
        result: {
          allowed: true,
          source: 'plan',
          allocations: [{ source: 'plan', units }],
          remaining: remaining - units,
          limit,
          used: used + units,
        },
        projectionJob: {
          usageLedgerId: usageEvent.id,
          tenantId,
          featureKey,
          featureId: feature.id,
          featureName: feature.name,
          featureType: feature.feature_type,
          subscriptionId: subscription.id,
          units,
          billingPeriod,
          allocations: [{ source: 'plan', units }],
          resourceType: usageEvent.resource_type,
          resourceId: usageEvent.resource_id,
          actorId: userId,
          recordedAt: usageEvent.recorded_at.toISOString(),
          idempotencyKey: usageEvent.idempotency_key,
          creditDeducted: false,
        },
      };
    }

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
        result: {
          allowed: false,
          reason: 'quota_exceeded',
          limit,
          used,
        },
      };
    }

    // Creditable: implement partial credit fallback
    // Use remaining plan quota first, then fill the gap with credits
    const creditBalance = await this.creditLedgerService.getBalance(tenantId, {
      client,
    });

    const creditCostPerUnit =
      feature.credit_cost != null && feature.credit_cost > 0
        ? feature.credit_cost
        : 1; // Default to 1 if not specified

    // Calculate split: use plan remaining first, then credits
    // Ensure planUnits is never negative (when quota is already exceeded)
    const planUnits = Math.max(0, Math.min(remaining, units)); // Use what's left in plan (0 if already over)
    const creditUnits = units - planUnits; // Fill the gap with credits
    const creditCost = creditUnits * creditCostPerUnit; // Use feature-specific credit cost

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
        result: {
          allowed: false,
          reason: 'quota_exceeded',
          limit,
          used,
          creditsRemaining: creditBalance,
        },
      };
    }

    // Build allocations array
    const allocations: Array<{ source: 'plan' | 'credit'; units: number }> = [];
    if (planUnits > 0) {
      allocations.push({ source: 'plan', units: planUnits });
    }
    if (creditUnits > 0) {
      allocations.push({ source: 'credit', units: creditUnits });
    }

    // Record usage with multi-source allocations
    const usageEvent = await this.usageIngestionService.recordUsage(
      {
        tenant_id: tenantId,
        feature_key: featureKey,
        user_id: userId,
        units,
        allocations,
        metadata: {
          ...metadata,
          credit_cost_per_unit: creditCostPerUnit,
          total_credits_deducted: creditCost,
          plan_units: planUnits,
          credit_units: creditUnits,
        },
      },
      { client },
    );

    // Deduct only the credit portion
    if (creditUnits > 0) {
      await this.creditLedgerService.deduct(
        tenantId,
        creditCost,
        feature.id,
        usageEvent.id,
        {
          ...metadata,
          credit_fallback: true,
          credit_cost_per_unit: creditCostPerUnit,
          units_consumed: creditUnits,
        },
        { client },
      );
    }

    this.logger.log(
      `Partial credit fallback: tenant=${tenantId}, feature=${featureKey}, plan=${planUnits}, credits=${creditUnits}, cost=${creditCost}, remaining_credits=${creditBalance - creditCost}`,
    );

    // Determine source for response (primary source or 'mixed')
    const responseSource =
      allocations.length === 1 ? allocations[0].source : 'mixed';

    return {
      result: {
        allowed: true,
        source: responseSource as any, // 'plan', 'credit', or 'mixed'
        allocations,
        creditsRemaining: creditBalance - creditCost,
        creditsDeducted: creditUnits > 0 ? creditCost : undefined, // Only include if credits were used
        creditCostPerUnit: creditUnits > 0 ? creditCostPerUnit : undefined, // Only include if credits were used
        limit,
        used: used + units,
      },
      projectionJob: {
        usageLedgerId: usageEvent.id,
        tenantId,
        featureKey,
        featureId: feature.id,
        featureName: feature.name,
        featureType: feature.feature_type,
        subscriptionId: subscription.id,
        units,
        billingPeriod,
        allocations: allocations.map((a) => ({
          source: a.source,
          units: a.units,
        })),
        resourceType: usageEvent.resource_type,
        resourceId: usageEvent.resource_id,
        actorId: userId,
        recordedAt: usageEvent.recorded_at.toISOString(),
        idempotencyKey: usageEvent.idempotency_key,
        creditDeducted: creditUnits > 0,
        creditAmount: creditUnits > 0 ? creditCost : undefined,
      },
    };
  }

  /**
   * Derive billing period string (YYYY-MM) from a date
   */
  private deriveBillingPeriod(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Enqueue PROJECTION_UPDATE job for async processing.
   * Falls back to sync incrementUsage if BullMQ is unavailable.
   */
  private async enqueueProjectionUpdate(
    data: EntitlementProjectionUpdateJobData,
  ): Promise<void> {
    try {
      await this.queueProducer.enqueue(
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
        ENTITLEMENT_JOB_NAMES.PROJECTION_UPDATE,
        data,
        { attempts: 5, backoff: { type: 'exponential', delay: 500 } },
      );
    } catch (error) {
      this.logger.warn(
        `BullMQ unavailable, falling back to sync projection update: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.usageProjectionService.incrementUsage(
        data.tenantId,
        data.subscriptionId,
        data.featureId,
        data.billingPeriod,
        data.allocations,
        data.usageLedgerId,
      );
    }
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
    await this.domainEventsService.emit(
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
