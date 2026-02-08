import { Injectable, Logger } from '@nestjs/common';
import {
  AggregatedUsage,
  FeatureKey,
  UsageSource,
} from '../../../common/types/entitlement.types';
import { QueryOptions } from '../../../repositories/base/repository.interface';
import { AggregatedUsageRepository } from '../../../repositories/usage/aggregated-usage.repository';
import { UsageLedgerRepository } from '../../../repositories/usage/usage-ledger.repository';

/**
 * Usage Projection Service
 *
 * Maintains the aggregated_usage projection table as a derived view
 * of the usage_ledger (source of truth).
 *
 * Key responsibilities:
 * - Atomically increment usage counters when events are recorded
 * - Provide fast reads of current usage for quota enforcement
 * - Rebuild projections from ledger for consistency verification
 *
 * Architecture:
 * - usage_ledger = append-only event store (source of truth)
 * - aggregated_usage = projection (derived, can be rebuilt)
 *
 * TODO: BullMQ - In production, projection updates should be processed
 * by a BullMQ worker consuming usage events from a queue. This ensures
 * the write path (usage recording) is fast and the projection update
 * happens asynchronously. For now, we update synchronously within the
 * same transaction for consistency.
 */
@Injectable()
export class UsageProjectionService {
  private readonly logger = new Logger(UsageProjectionService.name);

  constructor(
    private readonly aggregatedUsageRepository: AggregatedUsageRepository,
    private readonly usageLedgerRepository: UsageLedgerRepository,
  ) {}

  /**
   * Atomically increment usage counters for a feature
   *
   * This method is called synchronously after recording a usage event.
   * It updates the aggregated_usage projection with atomic SQL increments
   * to prevent race conditions.
   *
   * Using subscription_id ensures:
   * - Each billing period gets its own projection (unambiguous)
   * - Quota enforcement checks the correct subscription
   * - Works for any billing cycle (monthly, yearly, custom)
   *
   * TODO: BullMQ - Move this to an async queue worker. The worker would:
   * 1. Consume usage.recorded events from a queue
   * 2. Call this method to update the projection
   * 3. Handle retries if the update fails
   * 4. Emit projection.updated event when complete
   *
   * @param tenantId - Tenant ID
   * @param subscriptionId - Subscription ID (source of truth for billing period)
   * @param featureId - Feature UUID
   * @param billingPeriod - Billing period (YYYY-MM format, for analytics)
   * @param units - Number of units to increment
   * @param source - Usage source (plan, addon, credit, override)
   * @param eventId - Usage ledger event ID (for idempotency)
   * @param options - Query options (client for transactions)
   * @returns Updated aggregated usage
   */
  async incrementUsage(
    tenantId: string,
    subscriptionId: string,
    featureId: string,
    billingPeriod: string,
    units: number,
    source: UsageSource,
    eventId: string,
    options?: QueryOptions,
  ): Promise<AggregatedUsage> {
    this.logger.debug(
      `Incrementing usage: tenant=${tenantId}, subscription=${subscriptionId}, feature=${featureId}, period=${billingPeriod}, units=${units}, source=${source}`,
    );

    return this.aggregatedUsageRepository.increment(
      tenantId,
      subscriptionId,
      featureId,
      billingPeriod,
      units,
      source,
      eventId,
      options,
    );
  }

  /**
   * Get current aggregated usage for a tenant and feature
   *
   * This is the fast read path for quota enforcement checks.
   * Returns the projection (not the ledger).
   *
   * Using subscription_id ensures we check usage for the correct
   * billing period, even if the subscription started mid-month.
   *
   * @param tenantId - Tenant ID
   * @param subscriptionId - Subscription ID (identifies the billing period)
   * @param featureKey - Feature key (e.g., 'documents_per_month')
   * @param options - Query options
   * @returns Aggregated usage or null if no usage recorded yet
   */
  async getCurrentUsage(
    tenantId: string,
    subscriptionId: string,
    featureKey: FeatureKey,
    options?: QueryOptions,
  ): Promise<AggregatedUsage | null> {
    return this.aggregatedUsageRepository.findCurrent(
      tenantId,
      subscriptionId,
      featureKey,
      options,
    );
  }

  /**
   * Rebuild aggregated usage projection from usage ledger
   *
   * This method recomputes the aggregated_usage row by summing all
   * usage_ledger events for a tenant, feature, and billing period.
   *
   * Use cases:
   * - Consistency verification (compare projection vs ledger)
   * - Recovery from projection corruption
   * - Auditing and reconciliation
   *
   * TODO: BullMQ - A scheduled cron job should periodically run this
   * for all active tenants to detect and fix projection drift. Alert
   * if the projection doesn't match the ledger sum.
   *
   * @param tenantId - Tenant ID
   * @param subscriptionId - Subscription ID (identifies the billing period)
   * @param featureId - Feature UUID
   * @param billingPeriod - Billing period (YYYY-MM format)
   * @param options - Query options
   * @returns Rebuilt aggregated usage
   */
  async rebuildFromLedger(
    tenantId: string,
    subscriptionId: string,
    featureId: string,
    billingPeriod: string,
    options?: QueryOptions,
  ): Promise<AggregatedUsage> {
    this.logger.log(
      `Rebuilding projection from ledger: tenant=${tenantId}, subscription=${subscriptionId}, feature=${featureId}, period=${billingPeriod}`,
    );

    // Fetch all usage events from ledger
    const events = await this.usageLedgerRepository.findByTenantFeaturePeriod(
      tenantId,
      featureId,
      billingPeriod,
      options,
    );

    // Aggregate by source
    let totalUnits = 0;
    let planUnits = 0;
    let addonUnits = 0;
    let creditUnits = 0;
    let overrideUnits = 0;
    let lastEventId: string | undefined;

    for (const event of events) {
      totalUnits += event.units;
      lastEventId = event.id;

      switch (event.source) {
        case 'plan':
          planUnits += event.units;
          break;
        case 'addon':
          addonUnits += event.units;
          break;
        case 'credit':
          creditUnits += event.units;
          break;
        case 'override':
          overrideUnits += event.units;
          break;
      }
    }

    // Upsert the projection (full replace)
    const rebuilt = await this.aggregatedUsageRepository.upsert(
      {
        tenant_id: tenantId,
        subscription_id: subscriptionId,
        feature_id: featureId,
        billing_period: billingPeriod,
        total_units: totalUnits,
        plan_units: planUnits,
        addon_units: addonUnits,
        credit_units: creditUnits,
        override_units: overrideUnits,
        last_event_id: lastEventId,
      },
      options,
    );

    this.logger.log(
      `Projection rebuilt: ${events.length} events, ${totalUnits} total units`,
    );

    return rebuilt;
  }

  /**
   * TODO: BullMQ - Process a single usage event (called by queue worker)
   *
   * This method would be called by a BullMQ worker that consumes
   * usage.recorded events from a queue. It would:
   * 1. Receive the event ID from the queue
   * 2. Fetch the event from usage_ledger
   * 3. Call incrementUsage() to update the projection
   * 4. Emit projection.updated event
   *
   * Example worker implementation:
   * ```typescript
   * @Processor('usage-projection')
   * export class UsageProjectionWorker {
   *   @Process('update')
   *   async processUsageEvent(job: Job<{ eventId: string }>) {
   *     await this.projectionService.processUsageEvent(job.data.eventId);
   *   }
   * }
   * ```
   *
   * async processUsageEvent(eventId: string): Promise<void> {
   *   // Implementation would go here
   * }
   */
}
