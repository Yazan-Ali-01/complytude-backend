import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { getFeatureDefinition } from '../../../common/constants/plan-entitlements.constant';
import {
  FeatureKey,
  UsageLedgerEvent,
  UsageRecordInput,
} from '../../../common/types/entitlement.types';
import { DatabaseService } from '../../../database/database.service';
import { QueryOptions } from '../../../repositories/base/repository.interface';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { SubscriptionsRepository } from '../../../repositories/subscriptions/subscriptions.repository';
import { UsageAllocationsRepository } from '../../../repositories/usage/usage-allocations.repository';
import { UsageLedgerRepository } from '../../../repositories/usage/usage-ledger.repository';
import { DomainEventsService } from './domain-events.service';
import { UsageProjectionService } from './usage-projection.service';

/**
 * Usage Ingestion Service
 *
 * Core service for recording usage events to the usage_ledger (source of truth).
 *
 * Key responsibilities:
 * - Record usage events with source attribution (plan, addon, credit, override)
 * - Resolve feature_id from feature_key
 * - Derive billing_period from tenant's active subscription
 * - Support idempotency keys to prevent duplicate events
 * - Update aggregated_usage projection (synchronously for now)
 * - Emit domain events for audit trail
 *
 * Architecture:
 * - All operations run in a transactionWithTenantContext for atomicity
 * - usage_ledger is append-only (immutable event store)
 * - aggregated_usage is updated synchronously (will move to async queue)
 * - domain_events provides audit trail and replayability
 *
 * TODO: BullMQ - The projection update should be moved to an async queue
 * worker for better performance at scale. The flow would be:
 * 1. Record usage event to ledger (fast write)
 * 2. Emit usage.recorded event to queue
 * 3. Return immediately to caller
 * 4. Queue worker updates projection asynchronously
 */
@Injectable()
export class UsageIngestionService {
  private readonly logger = new Logger(UsageIngestionService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly usageLedgerRepository: UsageLedgerRepository,
    private readonly usageAllocationsRepository: UsageAllocationsRepository,
    private readonly featuresRepository: FeaturesRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly domainEventsService: DomainEventsService,
    private readonly usageProjectionService: UsageProjectionService,
  ) {}

  /**
   * Record a usage event
   *
   * This is the main entry point for recording usage. It orchestrates:
   * 1. Feature validation
   * 2. Billing period derivation
   * 3. Usage ledger append
   * 4. Projection update (synchronous for now)
   * 5. Domain event emission
   *
   * All operations run in a single transaction for atomicity.
   *
   * @param input - Usage record input
   * @param options - Query options (optional client for shared transactions)
   * @returns The recorded usage ledger event
   *
   * @throws NotFoundException - Feature not found or inactive
   * @throws NotFoundException - Tenant has no active subscription
   * @throws BadRequestException - Invalid input (e.g., negative units)
   */
  async recordUsage(
    input: UsageRecordInput,
    options?: QueryOptions,
  ): Promise<UsageLedgerEvent> {
    const { tenant_id, feature_key, user_id, units, allocations, metadata } =
      input;

    // Validate units
    if (units <= 0) {
      throw new BadRequestException('Units must be greater than 0');
    }

    // Validate allocations
    if (!allocations || allocations.length === 0) {
      throw new BadRequestException('At least one allocation is required');
    }

    const allocationSum = allocations.reduce((sum, a) => sum + a.units, 0);
    if (allocationSum !== units) {
      throw new BadRequestException(
        `Allocation sum (${allocationSum}) must equal total units (${units})`,
      );
    }

    for (const allocation of allocations) {
      if (allocation.units <= 0) {
        throw new BadRequestException('Each allocation must have units > 0');
      }
    }

    this.logger.debug(
      `Recording usage: tenant=${tenant_id}, feature=${feature_key}, units=${units}, allocations=${JSON.stringify(allocations)}`,
    );

    const execute = async (client: PoolClient) => {
      // Step 1: Resolve feature_id from feature_key
      const feature = await this.featuresRepository.findByKey(feature_key, {
        client,
      });

      if (!feature) {
        throw new NotFoundException(`Feature not found: ${feature_key}`);
      }

      if (!feature.is_active) {
        throw new BadRequestException(`Feature is inactive: ${feature_key}`);
      }

      // Step 2: Get tenant's active subscription to derive billing_period
      const subscription =
        await this.subscriptionsRepository.findActiveByTenant(tenant_id, {
          client,
        });

      if (!subscription) {
        throw new NotFoundException(
          `No active subscription for tenant: ${tenant_id}`,
        );
      }

      // Derive billing period (YYYY-MM format)
      const billingPeriod = this.deriveBillingPeriod(
        subscription.current_period_start,
      );

      // Step 3: Record usage event to ledger (append-only)
      const usageEvent = await this.usageLedgerRepository.record(
        {
          tenant_id,
          feature_id: feature.id,
          user_id,
          units,
          billing_period: billingPeriod,
          resource_type: input.resource_type,
          resource_id: input.resource_id,
          metadata: metadata ? JSON.stringify(metadata) : '{}',
          idempotency_key: input.idempotency_key,
        },
        { client },
      );

      // Step 3b: Record allocations (bulk insert)
      await this.usageAllocationsRepository.recordAllocations(
        allocations.map((a) => ({
          usage_ledger_id: usageEvent.id,
          source: a.source,
          units: a.units,
        })),
        { client },
      );

      // Step 4: Update aggregated_usage projection (synchronous for now)
      // TODO: BullMQ - Instead of calling this synchronously, emit a
      // usage.recorded event to a queue. A worker would consume the event
      // and call usageProjectionService.incrementUsage() asynchronously.
      // This keeps the write path fast and moves projection updates off
      // the critical path.
      await this.usageProjectionService.incrementUsage(
        tenant_id,
        subscription.id, // Use subscription ID (unambiguous billing period)
        feature.id,
        billingPeriod,
        allocations,
        usageEvent.id,
        { client },
      );

      // Step 5: Emit domain event for audit trail
      // TODO: BullMQ - Domain event emission could also be moved to an
      // async queue for non-critical events. Critical events (e.g., credit
      // deduction) should remain synchronous.
      await this.emitUsageRecordedEvent(
        usageEvent,
        allocations,
        feature_key,
        feature.name,
        user_id,
        { client },
      );

      this.logger.log(
        `Usage recorded: event_id=${usageEvent.id}, tenant=${tenant_id}, feature=${feature_key}, units=${units}, allocations=${allocations.length}`,
      );

      return usageEvent;
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId: tenant_id },
      execute,
    );
  }

  /**
   * Derive billing period string from a date
   *
   * Converts a Date to YYYY-MM format for billing period tracking.
   *
   * @param date - Date to convert
   * @returns Billing period string (e.g., '2026-02')
   */
  private deriveBillingPeriod(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Emit usage.recorded domain event
   *
   * Domain events provide an audit trail and enable event sourcing patterns.
   * The event payload includes a snapshot of the feature at the time of
   * recording to preserve historical accuracy even if the feature is
   * renamed or modified later.
   *
   * @param usageEvent - The recorded usage ledger event
   * @param allocations - Array of { source, units } allocations
   * @param featureKey - Feature key (snapshot)
   * @param featureName - Feature name (snapshot)
   * @param userId - User who triggered the usage (optional)
   * @param options - Query options
   */
  private async emitUsageRecordedEvent(
    usageEvent: UsageLedgerEvent,
    allocations: Array<{ source: string; units: number }>,
    featureKey: FeatureKey,
    featureName: string,
    userId?: string,
    options?: QueryOptions,
  ): Promise<void> {
    const featureDef = getFeatureDefinition(featureKey);

    await this.domainEventsService.emit(
      {
        tenant_id: usageEvent.tenant_id,
        event_type: 'usage.recorded',
        aggregate_type: 'usage',
        aggregate_id: usageEvent.id,
        actor_id: userId,
        actor_type: userId ? 'user' : 'system',
        payload: JSON.stringify({
          usage_event_id: usageEvent.id,
          feature_id: usageEvent.feature_id,
          feature_key: featureKey, // Snapshot for historical accuracy
          feature_name: featureName, // Snapshot for historical accuracy
          feature_type: featureDef?.feature_type,
          units: usageEvent.units,
          allocations, // Multi-source breakdown
          billing_period: usageEvent.billing_period,
          resource_type: usageEvent.resource_type,
          resource_id: usageEvent.resource_id,
        }),
        metadata: JSON.stringify({
          recorded_at: usageEvent.recorded_at,
          idempotency_key: usageEvent.idempotency_key,
        }),
      },
      options,
    );
  }

  /**
   * TODO: BullMQ - Billing period rollover
   *
   * A scheduled cron job (BullMQ repeatable job) should run at the start
   * of each billing period to:
   * 1. Archive old aggregated_usage rows (or mark as historical)
   * 2. Create new aggregated_usage rows with 0 usage for the new period
   * 3. Emit billing_period.rolled_over domain events
   * 4. Notify tenants approaching their limits
   *
   * Example cron schedule: '0 0 1 * *' (midnight on the 1st of each month)
   *
   * async rolloverBillingPeriod(tenantId: string): Promise<void> {
   *   // Implementation would go here
   * }
   */
}
