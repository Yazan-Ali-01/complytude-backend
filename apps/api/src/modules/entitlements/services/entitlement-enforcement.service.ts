import { DatabaseService, QueryOptions } from '@lib/database';
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
import { I18n, I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import { CommonI18n } from '../../../common/constants';
import { getFeatureDefinition } from '../../../common/constants/plan-entitlements.constant';
import {
  AllocationResolution,
  BuildProjectionJobInput,
  CheckAndRecordInput,
  EmitDenialEventInput,
  EnforceUsageBasedInput,
  EnforceUsageLimitedInput,
  EnforceUsageUnlimitedInput,
  EntitlementCheckResult,
  ResolveAllocationsInput,
  UsageWriteResult,
  WriteUsageAndCreditsInput,
} from '../../../common/types/entitlement.types';
import { deriveBillingPeriod } from '../../../common/utils/billing.util';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { SubscriptionsRepository } from '../../../repositories/subscriptions/subscriptions.repository';
import { AggregatedUsageRepository } from '../../../repositories/usage/aggregated-usage.repository';
import { UsageLedgerRepository } from '../../../repositories/usage/usage-ledger.repository';
import { buildUsageRecordedEvent } from '../utils/usage-event-payload.util';
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
    private readonly usageLedgerRepository: UsageLedgerRepository,
    private readonly configService: ConfigService,
    private readonly queueProducer: QueueProducerService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  async checkAndRecord(
    input: CheckAndRecordInput,
    options?: QueryOptions,
  ): Promise<EntitlementCheckResult> {
    const { tenantId, featureKey, userId, units = 1, metadata } = input;
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
        throw new NotFoundException(
          this.i18n.t(CommonI18n.errors.NOT_FOUND) ??
            `Feature not found: ${featureKey}`,
        );
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
          {
            tenantId,
            featureKey,
            entitlement,
            userId,
            units,
            metadata,
          },
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
    input: EnforceUsageBasedInput,
    client: PoolClient,
  ): Promise<EnforceResult> {
    const { tenantId, featureKey, entitlement, userId, units, metadata } =
      input;
    const subscription = await this.subscriptionsRepository.findActiveByTenant(
      tenantId,
      { client },
    );

    if (!subscription) {
      throw new NotFoundException(
        this.i18n.t(CommonI18n.errors.NOT_FOUND) ??
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
      throw new NotFoundException(
        this.i18n.t(CommonI18n.errors.NOT_FOUND) ??
          `Feature not found: ${featureKey}`,
      );
    }
    if (!feature.is_active) {
      throw new BadRequestException(
        this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
          `Feature is inactive: ${featureKey}`,
      );
    }
    const billingPeriod = deriveBillingPeriod(
      subscription.current_period_start,
    );

    // Unlimited -> always async path (no strict CAS needed).
    if (limit === -1) {
      return this.enforceUsageUnlimited(
        {
          tenantId,
          featureKey,
          userId,
          units,
          metadata,
          subscription,
          feature,
          billingPeriod,
          used,
        },
        client,
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
        {
          tenantId,
          featureKey,
          userId,
          units,
          metadata,
          subscription,
          feature,
          billingPeriod,
          limit,
          used,
        },
        client,
      );
    }

    return this.enforceUsageAsync(
      {
        tenantId,
        featureKey,
        userId,
        units,
        metadata,
        subscription,
        feature,
        billingPeriod,
        limit,
        used,
      },
      client,
    );
  }

  private async enforceUsageAsync(
    input: EnforceUsageLimitedInput,
    client: PoolClient,
  ): Promise<EnforceResult> {
    const {
      tenantId,
      featureKey,
      userId,
      units,
      metadata,
      subscription,
      feature,
      billingPeriod,
      limit,
      used,
    } = input;

    let allocationResolution: AllocationResolution;
    try {
      allocationResolution = await this.resolveAllocationsWithCreditFallback(
        {
          tenantId,
          featureKey,
          userId,
          units,
          limit,
          used,
          featureCreditCost: feature.credit_cost,
        },
        client,
      );
    } catch (error) {
      if (error instanceof EntitlementDeniedException) {
        return error.enforceResult;
      }
      throw error;
    }

    const { usageEvent, planUnits } = await this.writeUsageAndCredits(
      {
        tenantId,
        featureKey,
        userId,
        units,
        metadata,
        feature,
        billingPeriod,
        allocationResolution,
      },
      client,
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
          remaining: limit - used - units,
          limit,
          used: used + units,
        },
        projectionJob: this.buildProjectionJob({
          tenantId,
          featureKey,
          usageEvent,
          feature,
          subscription,
          billingPeriod,
          allocations: allocations.map((a) => ({
            source: a.source,
            units: a.units,
          })),
          userId,
        }),
      };
    }

    return {
      result: {
        allowed: true,
        source: responseSource,
        allocations,
        remaining: 0,
        creditsRemaining: (creditBalance ?? 0) - creditCost,
        creditsDeducted: creditUnits > 0 ? creditCost : undefined,
        creditCostPerUnit: creditUnits > 0 ? creditCostPerUnit : undefined,
        limit,
        used: used + units,
      },
      projectionJob: this.buildProjectionJob({
        tenantId,
        featureKey,
        usageEvent,
        feature,
        subscription,
        billingPeriod,
        allocations: allocations.map((a) => ({
          source: a.source,
          units: a.units,
        })),
        userId,
        creditDeducted: creditUnits > 0,
        creditAmount: creditUnits > 0 ? creditCost : undefined,
      }),
    };
  }

  private async enforceUsageStrict(
    input: EnforceUsageLimitedInput,
    client: PoolClient,
  ): Promise<EnforceResult> {
    const {
      tenantId,
      featureKey,
      userId,
      units,
      metadata,
      subscription,
      feature,
      billingPeriod,
      limit,
      used,
    } = input;
    let allocationResolution: AllocationResolution;
    try {
      allocationResolution = await this.resolveAllocationsWithCreditFallback(
        {
          tenantId,
          featureKey,
          userId,
          units,
          limit,
          used,
          featureCreditCost: feature.credit_cost,
        },
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
        {
          tenantId,
          featureKey,
          userId,
          units,
          metadata,
          feature,
          billingPeriod,
          allocationResolution,
        },
        client,
      );

      const casResult =
        await this.aggregatedUsageRepository.conditionalIncrement(
          {
            tenantId,
            subscriptionId: subscription.id,
            featureId: feature.id,
            billingPeriod,
            allocations: allocations.map((a) => ({
              source: a.source,
              units: a.units,
            })),
            limit,
          },
          { client },
        );

      if (!casResult) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        this.logger.debug(
          `Strict mode CAS failed: tenant=${tenantId} feature=${featureKey} limit=${limit} - concurrent request consumed remaining quota`,
        );
        await this.emitDenialEvent(
          {
            tenantId,
            featureKey,
            userId,
            units,
            limit,
            used,
            reason: 'concurrent_quota_race',
          },
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
          source: responseSource,
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
    input: EnforceUsageUnlimitedInput,
    client: PoolClient,
  ): Promise<EnforceResult> {
    const {
      tenantId,
      featureKey,
      userId,
      units,
      metadata,
      subscription,
      feature,
      billingPeriod,
      used,
    } = input;
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
      projectionJob: this.buildProjectionJob({
        tenantId,
        featureKey,
        usageEvent,
        feature,
        subscription,
        billingPeriod,
        allocations: [{ source: 'plan', units }],
        userId,
      }),
    };
  }

  /**
   * Write usage to ledger and deduct credits if applicable.
   * Shared by enforceUsageAsync and enforceUsageStrict; caller is responsible
   * for any savepoint wrapping around this call.
   */
  private async writeUsageAndCredits(
    input: WriteUsageAndCreditsInput,
    client: PoolClient,
  ): Promise<UsageWriteResult> {
    const {
      tenantId,
      featureKey,
      userId,
      units,
      metadata,
      feature,
      billingPeriod,
      allocationResolution,
    } = input;

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
        {
          tenantId,
          amount: creditCost,
          featureId: feature.id,
          usageLedgerId: usageEvent.id,
          metadata: {
            ...metadata,
            credit_fallback: true,
            credit_cost_per_unit: creditCostPerUnit,
            units_consumed: creditUnits,
          },
        },
        { client },
      );
    }

    return { usageEvent, planUnits };
  }

  private async resolveAllocationsWithCreditFallback(
    input: ResolveAllocationsInput,
    client: PoolClient,
  ): Promise<AllocationResolution> {
    const {
      tenantId,
      featureKey,
      userId,
      units,
      limit,
      used,
      featureCreditCost,
    } = input;
    const remaining = limit - used;

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
        {
          tenantId,
          featureKey,
          userId,
          units,
          limit,
          used,
          reason: 'not_creditable',
        },
        client,
      );

      throw new EntitlementDeniedException({
        result: {
          allowed: false,
          reason:
            this.i18n.t(CommonI18n.errors.QUOTA_EXCEEDED) ?? 'quota_exceeded',
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
        {
          tenantId,
          featureKey,
          userId,
          units,
          limit,
          used,
          reason: 'insufficient_credits',
        },
        client,
      );

      throw new EntitlementDeniedException({
        result: {
          allowed: false,
          reason:
            this.i18n.t(CommonI18n.errors.QUOTA_EXCEEDED) ?? 'quota_exceeded',
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
    input: BuildProjectionJobInput,
  ): EntitlementProjectionUpdateJobData {
    const {
      tenantId,
      featureKey,
      usageEvent,
      feature,
      subscription,
      billingPeriod,
      allocations,
      userId,
      creditDeducted = false,
      creditAmount,
    } = input;
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
   * Falls back to sync projection + domain event if BullMQ is unavailable.
   *
   * The fallback mirrors exactly what ProjectionUpdateHandler does (projection
   * increment + domain event) so downstream consumers see the same event
   * structure regardless of which path ran. Both operations are wrapped in
   * transactionWithTenantContext so RLS policies are satisfied.
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
        `[projection.fallback_to_sync] BullMQ unavailable — falling back to sync. ` +
          `tenant=${data.tenantId} feature=${data.featureKey} ledger=${data.usageLedgerId} ` +
          `error=${error instanceof Error ? error.message : String(error)}`,
      );

      await this.databaseService.transactionWithTenantContext(
        { tenantId: data.tenantId },
        async (client) => {
          // Same idempotency mechanism as the async path — prevents double-projection
          // if BullMQ later recovers and the job is retried.
          const claimed = await this.usageLedgerRepository.claimForProjection(
            data.usageLedgerId,
            { client },
          );

          if (!claimed) {
            this.logger.warn(
              `[projection.fallback_to_sync] Event already projected, skipping: ledger=${data.usageLedgerId}`,
            );
            return;
          }

          await this.usageProjectionService.incrementUsage(
            {
              tenantId: data.tenantId,
              subscriptionId: data.subscriptionId,
              featureId: data.featureId,
              billingPeriod: data.billingPeriod,
              allocations: data.allocations,
            },
            { client },
          );

          await this.domainEventsService.emit(
            buildUsageRecordedEvent(data, 'sync_fallback', {
              fallback_reason: 'bullmq_unavailable',
            }),
            { client },
          );
        },
      );
    }
  }

  private async emitDenialEvent(
    input: EmitDenialEventInput,
    client: PoolClient,
  ): Promise<void> {
    const { tenantId, featureKey, userId, units, limit, used, reason } = input;

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
