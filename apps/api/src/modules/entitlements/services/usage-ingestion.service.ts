import { QueryOptions } from '@lib/database';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  FeatureKey,
  UsageLedgerEvent,
  UsageRecordInput,
} from '../../../common/types/entitlement.types';
import { DatabaseService } from '../../../database/database.service';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { SubscriptionsRepository } from '../../../repositories/subscriptions/subscriptions.repository';
import { UsageAllocationsRepository } from '../../../repositories/usage/usage-allocations.repository';
import { UsageLedgerRepository } from '../../../repositories/usage/usage-ledger.repository';

/**
 * Usage Ingestion Service
 *
 * Pure append service for recording usage events to the usage_ledger
 * (source of truth) and usage_allocations.
 *
 * Key responsibilities:
 * - Validate and record usage events with source attribution
 * - Resolve feature_id from feature_key
 * - Derive billing_period from tenant's active subscription
 * - Support idempotency keys to prevent duplicate events
 *
 * Architecture:
 * - usage_ledger is append-only (immutable event store)
 * - Projection update (aggregated_usage) and domain event emission are
 *   handled asynchronously by ProjectionUpdateHandler via the
 *   entitlement-processing queue. See processors/projection-update.handler.ts
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
  ) {}

  /**
   * Record a usage event (append-only)
   *
   * Writes to usage_ledger and usage_allocations only. Projection update
   * and domain event emission are handled asynchronously by the
   * PROJECTION_UPDATE queue job after this returns.
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
    const {
      tenant_id,
      feature_key,
      feature_id,
      user_id,
      units,
      allocations,
      billing_period,
      metadata,
    } = input;

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
      const resolvedFeatureId = feature_id
        ? feature_id
        : await this.resolveFeatureId(feature_key, { client });

      const resolvedBillingPeriod = billing_period
        ? billing_period
        : await this.resolveBillingPeriod(tenant_id, { client });

      // Step 3: Record usage event to ledger (append-only)
      const usageEvent = await this.usageLedgerRepository.record(
        {
          tenant_id,
          feature_id: resolvedFeatureId,
          user_id,
          units,
          billing_period: resolvedBillingPeriod,
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
   * Resolve feature_id from feature_key. Validates feature exists and is active.
   */
  private async resolveFeatureId(
    featureKey: FeatureKey,
    options?: QueryOptions,
  ): Promise<string> {
    const feature = await this.featuresRepository.findByKey(
      featureKey,
      options,
    );

    if (!feature) {
      throw new NotFoundException(`Feature not found: ${featureKey}`);
    }

    if (!feature.is_active) {
      throw new BadRequestException(`Feature is inactive: ${featureKey}`);
    }

    return feature.id;
  }

  /**
   * Resolve billing_period from tenant's active subscription.
   */
  private async resolveBillingPeriod(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<string> {
    const subscription = await this.subscriptionsRepository.findActiveByTenant(
      tenantId,
      options,
    );

    if (!subscription) {
      throw new NotFoundException(
        `No active subscription for tenant: ${tenantId}`,
      );
    }

    return this.deriveBillingPeriod(subscription.current_period_start);
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
}
