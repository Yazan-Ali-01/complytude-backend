import { QueryOptions } from '@lib/database';
import {
  ENTITLEMENT_JOB_NAMES,
  EntitlementProjectionUpdateJobData,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { getFeatureDefinition } from '../../../common/constants/plan-entitlements.constant';
import {
  EffectiveEntitlement,
  EntitlementCheckResult,
  FeatureKey,
  UsageLedgerEvent,
  UsageSource,
} from '../../../common/types/entitlement.types';
import { deriveBillingPeriod } from '../../../common/utils/billing.util';
import { DatabaseService } from '../../../database/database.service';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { SubscriptionsRepository } from '../../../repositories/subscriptions/subscriptions.repository';
import { AggregatedUsageRepository } from '../../../repositories/usage/aggregated-usage.repository';
import { CreditLedgerService } from './credit-ledger.service';
import { DomainEventsService } from './domain-events.service';
import { EntitlementResolverService } from './entitlement-resolver.service';
import { UsageIngestionService } from './usage-ingestion.service';
import { UsageProjectionService } from './usage-projection.service';

interface EnforceResult {
  result: EntitlementCheckResult;
  projectionJob?: EntitlementProjectionUpdateJobData;
}

class EntitlementDeniedException extends Error {
  constructor(public readonly enforceResult: EnforceResult) {
    super('Entitlement denied');
    this.name = 'EntitlementDeniedException';
  }
}

interface AllocationResolution {
  mode: 'within_quota' | 'credit_fallback';
  allocations: Array<{ source: 'plan' | 'credit'; units: number }>;
  creditUnits: number;
  creditCost: number;
  creditCostPerUnit: number;
  creditBalance?: number;
}

interface UsageWriteResult {
  usageEvent: UsageLedgerEvent;
  planUnits: number;
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
    private readonly aggregatedUsageRepository: AggregatedUsageRepository,
    private readonly configService: ConfigService,
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
   * Pre-resolves subscription, usage, limit, and used so both async and strict
   * paths (COM-134) receive shared data without duplicate DB round-trips.
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
    const subscription = await this.subscriptionsRepository.findActiveByTenant(
      tenantId,
      { client },
    );

    if (!subscription) {
      throw new NotFoundException(
        `No active subscription for tenant: ${tenantId}`,
      );
    }

    const usage = await this.usageProjectionService.getCurrentUsage(
      tenantId,
      subscription.id,
      featureKey,
      { client },
    );

    const limit = entitlement.value_int ?? 0;
    const used = usage?.total_units ?? 0;
    const feature = await this.featuresRepository.findByKey(featureKey, {
      client,
    });
    if (!feature) {
      throw new NotFoundException(`Feature not found: ${featureKey}`);
    }
    if (!feature.is_active) {
      throw new BadRequestException(`Feature is inactive: ${featureKey}`);
    }
    const billingPeriod = deriveBillingPeriod(
      subscription.current_period_start,
    );

    // Unlimited -> always async path (no strict CAS needed).
    if (limit === -1) {
      return this.enforceUsageUnlimited(
        tenantId,
        featureKey,
        userId,
        units,
        metadata,
        client,
        subscription,
        feature,
        billingPeriod,
        used,
      );
    }

    const remaining = limit - used;
    const thresholdPercent = this.configService.get<number>(
      'app.entitlement.strictThresholdPercent',
      5,
    );
    const threshold = Math.max(Math.ceil((limit * thresholdPercent) / 100), 3);

    if (remaining <= threshold) {
      return this.enforceUsageStrict(
        tenantId,
        featureKey,
        userId,
        units,
        metadata,
        client,
        subscription,
        feature,
        billingPeriod,
        limit,
        used,
      );
    }

    return this.enforceUsageAsync(
      tenantId,
      featureKey,
      userId,
      units,
      metadata,
      client,
      subscription,
      feature,
      billingPeriod,
      limit,
      used,
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
   * @param subscription - Pre-resolved active subscription (from router)
   * @param limit - Pre-resolved entitlement limit (from router)
   * @param used - Pre-resolved current usage (from router)
   * @returns EnforceResult with result and optional projection job
   */
  private async enforceUsageAsync(
    tenantId: string,
    featureKey: FeatureKey,
    userId: string | undefined,
    units: number,
    metadata: Record<string, any> | undefined,
    client: PoolClient,
    subscription: { id: string },
    feature: {
      id: string;
      name: string;
      feature_type: string;
      credit_cost?: number | null;
    },
    billingPeriod: string,
    limit: number,
    used: number,
  ): Promise<EnforceResult> {
    const remaining = limit - used;
    let allocationResolution: AllocationResolution;
    try {
      allocationResolution = await this.resolveAllocationsWithCreditFallback(
        tenantId,
        featureKey,
        userId,
        units,
        limit,
        used,
        remaining,
        feature.credit_cost,
        client,
      );
    } catch (error) {
      if (error instanceof EntitlementDeniedException) {
        return error.enforceResult;
      }
      throw error;
    }

    const { usageEvent, planUnits } = await this.writeUsageAndCredits(
      tenantId,
      featureKey,
      userId,
      units,
      metadata,
      client,
      feature,
      billingPeriod,
      allocationResolution,
    );

    const {
      allocations,
      creditUnits,
      creditCost,
      creditCostPerUnit,
      creditBalance,
      mode,
    } = allocationResolution;
    const responseSource =
      allocations.length === 1 ? allocations[0].source : 'mixed';

    if (mode === 'credit_fallback') {
      this.logger.log(
        `Partial credit fallback: tenant=${tenantId}, feature=${featureKey}, plan=${planUnits}, credits=${creditUnits}, cost=${creditCost}, remaining_credits=${(creditBalance ?? 0) - creditCost}`,
      );
    }

    if (mode === 'within_quota') {
      return {
        result: {
          allowed: true,
          source: 'plan',
          allocations,
          remaining: remaining - units,
          limit,
          used: used + units,
        },
        projectionJob: this.buildProjectionJob(
          tenantId,
          featureKey,
          usageEvent,
          feature,
          subscription,
          billingPeriod,
          allocations.map((a) => ({ source: a.source, units: a.units })),
          userId,
        ),
      };
    }

    return {
      result: {
        allowed: true,
        source: responseSource as UsageSource,
        allocations,
        remaining: 0,
        creditsRemaining: (creditBalance ?? 0) - creditCost,
        creditsDeducted: creditUnits > 0 ? creditCost : undefined,
        creditCostPerUnit: creditUnits > 0 ? creditCostPerUnit : undefined,
        limit,
        used: used + units,
      },
      projectionJob: this.buildProjectionJob(
        tenantId,
        featureKey,
        usageEvent,
        feature,
        subscription,
        billingPeriod,
        allocations.map((a) => ({ source: a.source, units: a.units })),
        userId,
        creditUnits > 0,
        creditUnits > 0 ? creditCost : undefined,
      ),
    };
  }

  private async enforceUsageStrict(
    tenantId: string,
    featureKey: FeatureKey,
    userId: string | undefined,
    units: number,
    metadata: Record<string, any> | undefined,
    client: PoolClient,
    subscription: { id: string },
    feature: {
      id: string;
      name: string;
      feature_type: string;
      credit_cost?: number | null;
    },
    billingPeriod: string,
    limit: number,
    used: number,
  ): Promise<EnforceResult> {
    const remaining = limit - used;
    let allocationResolution: AllocationResolution;
    try {
      allocationResolution = await this.resolveAllocationsWithCreditFallback(
        tenantId,
        featureKey,
        userId,
        units,
        limit,
        used,
        remaining,
        feature.credit_cost,
        client,
      );
    } catch (error) {
      if (error instanceof EntitlementDeniedException) {
        return error.enforceResult;
      }
      throw error;
    }

    const {
      allocations,
      creditUnits,
      creditCost,
      creditCostPerUnit,
      creditBalance,
      mode,
    } = allocationResolution;
    const responseSource =
      allocations.length === 1 ? allocations[0].source : 'mixed';

    const savepointName = 'before_usage_append';
    let savepointReleased = false;
    await client.query(`SAVEPOINT ${savepointName}`);

    try {
      const { usageEvent, planUnits } = await this.writeUsageAndCredits(
        tenantId,
        featureKey,
        userId,
        units,
        metadata,
        client,
        feature,
        billingPeriod,
        allocationResolution,
      );

      const casResult =
        await this.aggregatedUsageRepository.conditionalIncrement(
          tenantId,
          subscription.id,
          feature.id,
          billingPeriod,
          allocations.map((a) => ({ source: a.source, units: a.units })),
          usageEvent.id,
          limit,
          { client },
        );

      if (!casResult) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        this.logger.debug(
          `Strict mode CAS failed: tenant=${tenantId} feature=${featureKey} limit=${limit} - concurrent request consumed remaining quota`,
        );
        await this.emitDenialEvent(
          tenantId,
          featureKey,
          userId,
          units,
          limit,
          used,
          'concurrent_quota_race',
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

      await client.query(`RELEASE SAVEPOINT ${savepointName}`);
      savepointReleased = true;

      await this.domainEventsService.emit(
        {
          tenant_id: tenantId,
          event_type: 'usage.recorded',
          aggregate_type: 'usage',
          aggregate_id: usageEvent.id,
          actor_id: userId,
          actor_type: userId ? 'user' : 'system',
          payload: JSON.stringify({
            usage_event_id: usageEvent.id,
            feature_id: feature.id,
            feature_key: featureKey,
            feature_name: feature.name,
            feature_type: feature.feature_type,
            units,
            allocations,
            billing_period: billingPeriod,
            resource_type: usageEvent.resource_type,
            resource_id: usageEvent.resource_id,
            recorded_at: usageEvent.recorded_at,
            idempotency_key: usageEvent.idempotency_key,
            enforcement_mode: 'strict',
            credit_deducted: creditUnits > 0,
            credit_amount: creditUnits > 0 ? creditCost : undefined,
          }),
          metadata: JSON.stringify({
            recorded_at: new Date().toISOString(),
          }),
        },
        { client },
      );

      if (mode === 'credit_fallback') {
        this.logger.log(
          `Strict credit fallback: tenant=${tenantId}, feature=${featureKey}, plan=${planUnits}, credits=${creditUnits}, cost=${creditCost}, remaining_credits=${(creditBalance ?? 0) - creditCost}`,
        );
      }

      return {
        result: {
          allowed: true,
          source: responseSource as UsageSource,
          allocations,
          remaining: limit - casResult.total_units,
          limit,
          used: casResult.total_units,
          creditsRemaining:
            mode === 'credit_fallback'
              ? (creditBalance ?? 0) - creditCost
              : undefined,
          creditsDeducted:
            mode === 'credit_fallback' && creditUnits > 0
              ? creditCost
              : undefined,
          creditCostPerUnit:
            mode === 'credit_fallback' && creditUnits > 0
              ? creditCostPerUnit
              : undefined,
        },
      };
    } catch (error) {
      if (!savepointReleased) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      }
      throw error;
    }
  }

  private async enforceUsageUnlimited(
    tenantId: string,
    featureKey: FeatureKey,
    userId: string | undefined,
    units: number,
    metadata: Record<string, any> | undefined,
    client: PoolClient,
    subscription: { id: string },
    feature: {
      id: string;
      name: string;
      feature_type: string;
      credit_cost?: number | null;
    },
    billingPeriod: string,
    used: number,
  ): Promise<EnforceResult> {
    const usageEvent = await this.usageIngestionService.recordUsage(
      {
        tenant_id: tenantId,
        feature_key: featureKey,
        feature_id: feature.id,
        user_id: userId,
        units,
        allocations: [{ source: 'plan', units }],
        billing_period: billingPeriod,
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
      projectionJob: this.buildProjectionJob(
        tenantId,
        featureKey,
        usageEvent,
        feature,
        subscription,
        billingPeriod,
        [{ source: 'plan', units }],
        userId,
      ),
    };
  }

  /**
   * Write usage to ledger and deduct credits if applicable.
   * Shared by enforceUsageAsync and enforceUsageStrict; caller is responsible
   * for any savepoint wrapping around this call.
   */
  private async writeUsageAndCredits(
    tenantId: string,
    featureKey: FeatureKey,
    userId: string | undefined,
    units: number,
    metadata: Record<string, any> | undefined,
    client: PoolClient,
    feature: {
      id: string;
      name: string;
      feature_type: string;
      credit_cost?: number | null;
    },
    billingPeriod: string,
    allocationResolution: AllocationResolution,
  ): Promise<UsageWriteResult> {
    const { allocations, creditUnits, creditCost, creditCostPerUnit, mode } =
      allocationResolution;
    const planUnits = allocations
      .filter((a) => a.source === 'plan')
      .reduce((sum, a) => sum + a.units, 0);
    const usageMetadata =
      mode === 'credit_fallback'
        ? {
            ...metadata,
            credit_cost_per_unit: creditCostPerUnit,
            total_credits_deducted: creditCost,
            plan_units: planUnits,
            credit_units: creditUnits,
          }
        : metadata;

    const usageEvent = await this.usageIngestionService.recordUsage(
      {
        tenant_id: tenantId,
        feature_key: featureKey,
        feature_id: feature.id,
        user_id: userId,
        units,
        allocations,
        billing_period: billingPeriod,
        metadata: usageMetadata,
      },
      { client },
    );

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

    return { usageEvent, planUnits };
  }

  private async resolveAllocationsWithCreditFallback(
    tenantId: string,
    featureKey: FeatureKey,
    userId: string | undefined,
    units: number,
    limit: number,
    used: number,
    remaining: number,
    featureCreditCost: number | null | undefined,
    client: PoolClient,
  ): Promise<AllocationResolution> {
    if (remaining >= units) {
      return {
        mode: 'within_quota',
        allocations: [{ source: 'plan', units }],
        creditUnits: 0,
        creditCost: 0,
        creditCostPerUnit: 0,
      };
    }

    const featureDef = getFeatureDefinition(featureKey);
    if (!featureDef?.creditable) {
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

      throw new EntitlementDeniedException({
        result: {
          allowed: false,
          reason: 'quota_exceeded',
          limit,
          used,
        },
      });
    }

    const creditBalance = await this.creditLedgerService.getBalance(tenantId, {
      client,
    });
    const creditCostPerUnit =
      featureCreditCost != null && featureCreditCost > 0
        ? featureCreditCost
        : 1;

    const planUnits = Math.max(0, Math.min(remaining, units));
    const creditUnits = units - planUnits;
    const creditCost = creditUnits * creditCostPerUnit;

    if (creditBalance < creditCost) {
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

      throw new EntitlementDeniedException({
        result: {
          allowed: false,
          reason: 'quota_exceeded',
          limit,
          used,
          creditsRemaining: creditBalance,
        },
      });
    }

    const allocations: Array<{ source: 'plan' | 'credit'; units: number }> = [];
    if (planUnits > 0) {
      allocations.push({ source: 'plan', units: planUnits });
    }
    if (creditUnits > 0) {
      allocations.push({ source: 'credit', units: creditUnits });
    }

    return {
      mode: 'credit_fallback',
      allocations,
      creditUnits,
      creditCost,
      creditCostPerUnit,
      creditBalance,
    };
  }

  /**
   * Build projection update job payload from usage event and context.
   * Centralizes the ~17-field construction used in unlimited, within-quota,
   * and credit-fallback paths.
   */
  private buildProjectionJob(
    tenantId: string,
    featureKey: FeatureKey,
    usageEvent: {
      id: string;
      resource_type?: string;
      resource_id?: string;
      recorded_at: Date;
      idempotency_key?: string;
    },
    feature: { id: string; name: string; feature_type: string },
    subscription: { id: string },
    billingPeriod: string,
    allocations: Array<{
      source: 'plan' | 'addon' | 'credit' | 'override';
      units: number;
    }>,
    userId: string | undefined,
    creditDeducted = false,
    creditAmount?: number,
  ): EntitlementProjectionUpdateJobData {
    const units = allocations.reduce((sum, a) => sum + a.units, 0);
    return {
      usageLedgerId: usageEvent.id,
      tenantId,
      featureKey,
      featureId: feature.id,
      featureName: feature.name,
      featureType: feature.feature_type,
      subscriptionId: subscription.id,
      units,
      billingPeriod,
      allocations,
      resourceType: usageEvent.resource_type,
      resourceId: usageEvent.resource_id,
      actorId: userId,
      recordedAt: usageEvent.recorded_at.toISOString(),
      idempotencyKey: usageEvent.idempotency_key,
      creditDeducted,
      creditAmount,
    };
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
        {
          jobId: data.usageLedgerId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 500 },
        },
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
