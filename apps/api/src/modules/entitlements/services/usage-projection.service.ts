import { QueryOptions } from '@lib/database';
import { Injectable, Logger } from '@nestjs/common';
import {
  AggregatedUsage,
  FeatureKey,
  UsageSource,
} from '../../../common/types/entitlement.types';
import { AggregatedUsageRepository } from '../../../repositories/usage/aggregated-usage.repository';
import { UsageAllocationsRepository } from '../../../repositories/usage/usage-allocations.repository';
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
 * Projection updates are processed asynchronously by ProjectionUpdateHandler
 * via the entitlement-processing queue. See processors/projection-update.handler.ts
 */
@Injectable()
export class UsageProjectionService {
  private readonly logger = new Logger(UsageProjectionService.name);

  constructor(
    private readonly aggregatedUsageRepository: AggregatedUsageRepository,
    private readonly usageLedgerRepository: UsageLedgerRepository,
    private readonly usageAllocationsRepository: UsageAllocationsRepository,
  ) {}

  /**
   * Atomically increment usage counters for a feature with multi-source allocations
   *
   * Called by ProjectionUpdateHandler when processing PROJECTION_UPDATE jobs.
   * Also used by EntitlementEnforcementService sync fallback when BullMQ is unavailable.
   *
   * Using subscription_id ensures:
   * - Each billing period gets its own projection (unambiguous)
   * - Quota enforcement checks the correct subscription
   * - Works for any billing cycle (monthly, yearly, custom)
   *
   * @param tenantId - Tenant ID
   * @param subscriptionId - Subscription ID (source of truth for billing period)
   * @param featureId - Feature UUID
   * @param billingPeriod - Billing period (YYYY-MM format, for analytics)
   * @param allocations - Array of { source, units } allocations
   * @param eventId - Usage ledger event ID (for idempotency)
   * @param options - Query options (client for transactions)
   * @returns Updated aggregated usage
   */
  async incrementUsage(
    tenantId: string,
    subscriptionId: string,
    featureId: string,
    billingPeriod: string,
    allocations: Array<{
      source: Exclude<UsageSource, 'mixed'>;
      units: number;
    }>,
    options?: QueryOptions,
  ): Promise<AggregatedUsage> {
    const totalUnits = allocations.reduce((sum, a) => sum + a.units, 0);
    this.logger.debug(
      `Incrementing usage: tenant=${tenantId}, subscription=${subscriptionId}, feature=${featureId}, period=${billingPeriod}, units=${totalUnits}, allocations=${JSON.stringify(allocations)}`,
    );

    return this.aggregatedUsageRepository.increment(
      tenantId,
      subscriptionId,
      featureId,
      billingPeriod,
      allocations,
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
   * Rebuild aggregated usage projection from usage allocations
   *
   * This method recomputes the aggregated_usage row by summing all
   * usage_allocations for a tenant, feature, and billing period.
   *
   * Use cases:
   * - Consistency verification (compare projection vs allocations)
   * - Recovery from projection corruption
   * - Auditing and reconciliation
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
      `Rebuilding projection from allocations: tenant=${tenantId}, subscription=${subscriptionId}, feature=${featureId}, period=${billingPeriod}`,
    );

    // Fetch all usage allocations from ledger
    const allocations =
      await this.usageAllocationsRepository.findByTenantFeaturePeriod(
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

    for (const allocation of allocations) {
      totalUnits += allocation.units;

      switch (allocation.source) {
        case 'plan':
          planUnits += allocation.units;
          break;
        case 'addon':
          addonUnits += allocation.units;
          break;
        case 'credit':
          creditUnits += allocation.units;
          break;
        case 'override':
          overrideUnits += allocation.units;
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
      },
      options,
    );

    this.logger.log(
      `Projection rebuilt: ${allocations.length} allocations, ${totalUnits} total units`,
    );

    return rebuilt;
  }
}
