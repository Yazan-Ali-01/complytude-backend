import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  FeatureKey,
  UsageSource,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from 'src/database/database.service';
import { FeaturesRepository } from '../../repositories/features/features.repository';
import { SubscriptionsRepository } from '../../repositories/subscriptions/subscriptions.repository';
import { UsageLedgerRepository } from '../../repositories/usage/usage-ledger.repository';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import { EntitlementResolverService } from '../entitlements/services/entitlement-resolver.service';
import { UsageIngestionService } from '../entitlements/services/usage-ingestion.service';
import { UsageProjectionService } from '../entitlements/services/usage-projection.service';

/**
 * Usage Mock Controller - Phase 3 Test Cases
 *
 * This controller demonstrates all usage tracking patterns including:
 * - Recording usage events (happy path)
 * - Quota enforcement (at-limit scenarios)
 * - Idempotency (duplicate prevention)
 * - Projection queries (current usage)
 * - Ledger queries (raw events)
 * - Projection rebuild (consistency verification)
 * - Full debug views (entitlements + usage + remaining)
 *
 * Test Tenants (from seed 008):
 * - Tenant 1 (general_counsel): 100 documents/month, 30 contract reviews
 * - Tenant 2 (shield + addon): 25 + 50 = 75 documents/month, 5 contract reviews
 * - Tenant 3 (infrastructure + override): 500 documents (override), unlimited reviews
 *
 * TODO: BullMQ - In production, usage recording would trigger async jobs:
 * 1. Record usage event to ledger (fast write)
 * 2. Emit usage.recorded event to queue
 * 3. Worker updates projection asynchronously
 * 4. Worker emits projection.updated event
 * 5. Worker checks quota and emits quota.exceeded if needed
 */
@Controller('mock/usage')
@AuthOptions({ tenant: true })
@ApiTags('mock-usage')
export class UsageMockController {
  constructor(
    private readonly usageIngestionService: UsageIngestionService,
    private readonly usageProjectionService: UsageProjectionService,
    private readonly entitlementResolver: EntitlementResolverService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly usageLedgerRepository: UsageLedgerRepository,
    private readonly featuresRepository: FeaturesRepository,
    private readonly databaseService: DatabaseService,
  ) {}

  // ============================================
  // USE CASE 1: Record Single Document Usage (Happy Path)
  // ============================================
  // Records 1 document usage for the current tenant
  // Expected behavior:
  // - Tenant 1: Success (within 100 limit)
  // - Tenant 2: Success (within 75 limit)
  // - Tenant 3: Success (within 500 override limit)
  // What could go wrong:
  // - No active subscription → 404 error
  // - Feature not found → 404 error
  // - Already at quota limit → Would succeed but shouldn't (Phase 4 adds enforcement)
  @Post('documents/generate')
  @ApiOperation({ summary: 'Record 1 document usage (happy path)' })
  @ApiResponse({ status: 200, description: 'Usage recorded successfully' })
  @ApiResponse({
    status: 404,
    description: 'Feature or subscription not found',
  })
  async recordDocumentUsage(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    const usageEvent = await this.usageIngestionService.recordUsage({
      tenant_id: user.tenantId,
      feature_key: 'documents_per_month',
      user_id: user.userId,
      units: 1,
      source: 'plan',
      resource_type: 'document',
      metadata: {
        action: 'generate',
        test_scenario: 'happy_path',
      },
    });

    return {
      message: 'Document usage recorded',
      usageEventId: usageEvent.id,
      tenantId: user.tenantId,
      featureKey: 'documents_per_month',
      units: 1,
      source: usageEvent.source,
      billingPeriod: usageEvent.billing_period,
      recordedAt: usageEvent.recorded_at,
    };
  }

  // ============================================
  // USE CASE 2: Record Multiple Documents (Bulk)
  // ============================================
  // Records N documents in a single call
  // Expected behavior:
  // - Tenant 1: Success for N <= 100
  // - Tenant 2: Success for N <= 75
  // - Tenant 3: Success for N <= 500
  // What could go wrong:
  // - N > quota limit → Would succeed but shouldn't (Phase 4 adds enforcement)
  // - N <= 0 → 400 error (validation)
  @Post('documents/generate-multiple')
  @ApiOperation({ summary: 'Record N document usage (bulk)' })
  @ApiResponse({ status: 200, description: 'Bulk usage recorded' })
  async recordBulkDocumentUsage(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('count') count: number,
  ) {
    if (!count || count <= 0) {
      throw new BadRequestException('Count must be greater than 0');
    }

    const usageEvent = await this.usageIngestionService.recordUsage({
      tenant_id: user.tenantId,
      feature_key: 'documents_per_month',
      user_id: user.userId,
      units: count,
      source: 'plan',
      resource_type: 'document',
      metadata: {
        action: 'bulk_generate',
        count,
      },
    });

    return {
      message: `${count} documents usage recorded`,
      usageEventId: usageEvent.id,
      tenantId: user.tenantId,
      units: count,
      billingPeriod: usageEvent.billing_period,
    };
  }

  // ============================================
  // USE CASE 3: Attempt Usage At Quota Limit
  // ============================================
  // Demonstrates what happens when trying to use a feature at the limit
  // Expected behavior:
  // - Currently: Records usage even at limit (Phase 3 has no enforcement)
  // - Phase 4: Will check quota and return 402 Payment Required
  // - Phase 4: Will offer credit fallback if available
  // What this demonstrates:
  // - Phase 3 is write-only (no enforcement)
  // - Phase 4 will add EntitlementEnforcementService with checkAndRecord()
  @Post('documents/generate-at-limit')
  @ApiOperation({
    summary: 'Attempt usage at quota limit (demonstrates Phase 4 need)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage recorded (no enforcement in Phase 3)',
  })
  async recordAtLimit(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    // TODO: Phase 4 - Replace with EntitlementEnforcementService.checkAndRecord()
    // which will:
    // 1. Check current usage vs entitlement limit
    // 2. If exceeded, check credit balance
    // 3. If credits available, deduct and record with source='credit'
    // 4. If no credits, return 402 Payment Required with upgrade prompt
    //
    // For now, we just record the usage without checking the limit
    const usageEvent = await this.usageIngestionService.recordUsage({
      tenant_id: user.tenantId,
      feature_key: 'documents_per_month',
      user_id: user.userId,
      units: 1,
      source: 'plan',
      metadata: {
        test_scenario: 'at_limit',
        note: 'Phase 3 has no enforcement - Phase 4 will add quota checks',
      },
    });

    return {
      message: 'Usage recorded (no quota enforcement in Phase 3 - see Phase 4)',
      usageEventId: usageEvent.id,
      warning:
        'Phase 4 will add EntitlementEnforcementService to check quota before recording',
    };
  }

  // ============================================
  // USE CASE 4: Record Contract Review Usage
  // ============================================
  // Records usage for a different feature (contract reviews)
  // Expected behavior:
  // - Tenant 1: Success (30 reviews limit)
  // - Tenant 2: Success (5 reviews limit)
  // - Tenant 3: Success (unlimited)
  // Demonstrates:
  // - Multi-feature usage tracking
  // - Same ingestion flow for all quota features
  @Post('contracts/review')
  @ApiOperation({ summary: 'Record 1 contract review usage' })
  @ApiResponse({ status: 200, description: 'Contract review usage recorded' })
  async recordContractReview(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    const usageEvent = await this.usageIngestionService.recordUsage({
      tenant_id: user.tenantId,
      feature_key: 'contract_reviews_per_month',
      user_id: user.userId,
      units: 1,
      source: 'plan',
      resource_type: 'contract_review',
      metadata: {
        action: 'analyze_contract',
      },
    });

    return {
      message: 'Contract review usage recorded',
      usageEventId: usageEvent.id,
      featureKey: 'contract_reviews_per_month',
      units: 1,
      billingPeriod: usageEvent.billing_period,
    };
  }

  // ============================================
  // USE CASE 5: Record Regulatory Query Usage
  // ============================================
  // Records usage for regulatory queries (Chat with Law)
  // Expected behavior:
  // - Tenant 1: Success (100 queries limit)
  // - Tenant 2: Success (20 queries limit)
  // - Tenant 3: Success (unlimited)
  @Post('regulatory/query')
  @ApiOperation({ summary: 'Record 1 regulatory query usage' })
  @ApiResponse({ status: 200, description: 'Regulatory query usage recorded' })
  async recordRegulatoryQuery(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    const usageEvent = await this.usageIngestionService.recordUsage({
      tenant_id: user.tenantId,
      feature_key: 'regulatory_queries_per_month',
      user_id: user.userId,
      units: 1,
      source: 'plan',
      resource_type: 'regulatory_query',
      metadata: {
        action: 'chat_with_law',
      },
    });

    return {
      message: 'Regulatory query usage recorded',
      usageEventId: usageEvent.id,
      featureKey: 'regulatory_queries_per_month',
      units: 1,
      billingPeriod: usageEvent.billing_period,
    };
  }

  // ============================================
  // USE CASE 6: Idempotent Usage Recording
  // ============================================
  // Records usage with an idempotency key
  // Expected behavior:
  // - First call: Records usage, returns new event
  // - Duplicate call (same key): Returns existing event (no duplicate)
  // Demonstrates:
  // - Idempotency key support in usage_ledger
  // - Prevents duplicate usage from retries/network issues
  // What could go wrong:
  // - Database constraint violation if key already exists (handled by unique constraint)
  @Post('idempotent')
  @ApiOperation({ summary: 'Record usage with idempotency key' })
  @ApiResponse({ status: 200, description: 'Usage recorded (or existing)' })
  async recordIdempotentUsage(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('idempotencyKey') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required');
    }

    const usageEvent = await this.usageIngestionService.recordUsage({
      tenant_id: user.tenantId,
      feature_key: 'documents_per_month',
      user_id: user.userId,
      units: 1,
      source: 'plan',
      idempotency_key: idempotencyKey,
      metadata: {
        test_scenario: 'idempotency',
      },
    });

    return {
      message: 'Usage recorded with idempotency key',
      usageEventId: usageEvent.id,
      idempotencyKey,
      note: 'Calling again with the same key will return this same event',
    };
  }

  // ============================================
  // USE CASE 7: Get Current Aggregated Usage
  // ============================================
  // Retrieves current usage from the aggregated_usage projection
  // Expected behavior:
  // - Returns aggregated usage for the current billing period
  // - Shows total_units and breakdown by source (plan, addon, credit, override)
  // - Returns null if no usage recorded yet
  // Demonstrates:
  // - Fast read path for quota enforcement (Phase 4)
  // - Projection vs ledger (projection is derived, ledger is source of truth)
  @Get('current/:featureKey')
  @ApiOperation({ summary: 'Get current aggregated usage for a feature' })
  @ApiResponse({ status: 200, description: 'Current usage' })
  async getCurrentUsage(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('featureKey') featureKey: FeatureKey,
  ) {
    return this.databaseService.transactionWithTenantContext(
      user.tenantId,
      async (client) => {
        const subscription =
          await this.subscriptionsRepository.findActiveByTenant(user.tenantId, {
            client,
          });
        if (!subscription) {
          throw new BadRequestException('No active subscription');
        }

        const billingPeriod = this.deriveBillingPeriod(
          subscription.current_period_start,
        );

        const usage = await this.usageProjectionService.getCurrentUsage(
          user.tenantId,
          subscription.id, // Use subscription ID (unambiguous)
          featureKey,
          { client },
        );

        return {
          tenantId: user.tenantId,
          subscriptionId: subscription.id,
          featureKey,
          billingPeriod,
          periodStart: subscription.current_period_start,
          periodEnd: subscription.current_period_end,
          usage: usage
            ? {
                totalUnits: usage.total_units,
                planUnits: usage.plan_units,
                addonUnits: usage.addon_units,
                creditUnits: usage.credit_units,
                overrideUnits: usage.override_units,
                lastUpdatedAt: usage.last_updated_at,
              }
            : null,
          note: usage
            ? 'This is the projection (fast read path) - linked to subscription for unambiguous billing period'
            : 'No usage recorded yet for this feature in this subscription period',
        };
      },
    );
  }

  // ============================================
  // USE CASE 8: Get Raw Usage Ledger Events
  // ============================================
  // Retrieves raw usage events from the usage_ledger (source of truth)
  // Expected behavior:
  // - Returns all usage events for the current billing period
  // - Shows individual events with timestamps, sources, and metadata
  // Demonstrates:
  // - Ledger as source of truth (append-only event store)
  // - Audit trail for usage tracking
  // - Can be used to rebuild projections
  @Get('ledger/:featureKey')
  @ApiOperation({ summary: 'Get raw usage ledger events for a feature' })
  @ApiResponse({ status: 200, description: 'Usage ledger events' })
  async getUsageLedger(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('featureKey') featureKey: FeatureKey,
  ) {
    return this.databaseService.transactionWithTenantContext(
      user.tenantId,
      async (client) => {
        const subscription =
          await this.subscriptionsRepository.findActiveByTenant(user.tenantId, {
            client,
          });

        if (!subscription) {
          throw new BadRequestException('No active subscription');
        }

        const billingPeriod = this.deriveBillingPeriod(
          subscription.current_period_start,
        );

        const feature = await this.featuresRepository.findByKey(featureKey, {
          client,
        });
        if (!feature) {
          throw new BadRequestException(`Feature not found: ${featureKey}`);
        }

        const events =
          await this.usageLedgerRepository.findByTenantFeaturePeriod(
            user.tenantId,
            feature.id,
            billingPeriod,
            { client },
          );

        return {
          tenantId: user.tenantId,
          featureKey,
          billingPeriod,
          eventCount: events.length,
          events: events.map((e) => ({
            id: e.id,
            units: e.units,
            source: e.source,
            resourceType: e.resource_type,
            resourceId: e.resource_id,
            recordedAt: e.recorded_at,
            metadata: e.metadata,
          })),
          note: 'This is the source of truth (append-only ledger)',
        };
      },
    );
  }

  // ============================================
  // USE CASE 9: Get Billing Period Info
  // ============================================
  // Shows the current billing period from the tenant's subscription
  // Expected behavior:
  // - Returns current period start/end dates
  // - Shows billing period string (YYYY-MM format)
  // Demonstrates:
  // - How billing periods are derived from subscriptions
  // - Period boundaries for usage tracking
  @Get('billing-period')
  @ApiOperation({ summary: 'Get current billing period info' })
  @ApiResponse({ status: 200, description: 'Billing period info' })
  async getBillingPeriod(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return this.databaseService.transactionWithTenantContext(
      user.tenantId,
      async (client) => {
        const subscription =
          await this.subscriptionsRepository.findActiveByTenantWithPlan(
            user.tenantId,
            { client },
          );
        if (!subscription) {
          throw new BadRequestException('No active subscription');
        }
        const billingPeriod = this.deriveBillingPeriod(
          subscription.current_period_start,
        );

        return {
          tenantId: user.tenantId,
          plan: subscription.plan?.key,
          billingPeriod,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          billingPeriodStart: subscription.billing_period_start,
          billingPeriodEnd: subscription.billing_period_end,
          note: 'Usage is tracked per billing period (YYYY-MM format)',
        };
      },
    );
  }

  // ============================================
  // USE CASE 10: Rebuild Projection from Ledger
  // ============================================
  // Triggers a projection rebuild from the usage ledger
  // Expected behavior:
  // - Recomputes aggregated_usage by summing all ledger events
  // - Returns the rebuilt projection
  // - Should match the current projection (if no drift)
  // Demonstrates:
  // - Projection rebuild for consistency verification
  // - Ledger as source of truth (projection is derived)
  // What could go wrong:
  // - Projection drift (projection doesn't match ledger sum)
  // TODO: BullMQ - A scheduled cron job should periodically rebuild
  // projections for all tenants to detect and fix drift
  @Post('rebuild-projection/:featureKey')
  @ApiOperation({ summary: 'Rebuild projection from ledger' })
  @ApiResponse({ status: 200, description: 'Projection rebuilt' })
  async rebuildProjection(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('featureKey') featureKey: FeatureKey,
  ) {
    return this.databaseService.transactionWithTenantContext(
      user.tenantId,
      async (client) => {
        const subscription =
          await this.subscriptionsRepository.findActiveByTenant(user.tenantId, {
            client,
          });
        if (!subscription) {
          throw new BadRequestException('No active subscription');
        }
        const billingPeriod = this.deriveBillingPeriod(
          subscription.current_period_start,
        );
        const feature = await this.featuresRepository.findByKey(featureKey, {
          client,
        });
        if (!feature) {
          throw new BadRequestException(`Feature not found: ${featureKey}`);
        }
        const rebuilt = await this.usageProjectionService.rebuildFromLedger(
          user.tenantId,
          subscription.id, // Use subscription ID
          feature.id,
          billingPeriod,
          { client },
        );
        return {
          message: 'Projection rebuilt from ledger',
          tenantId: user.tenantId,
          subscriptionId: subscription.id,
          featureKey,
          billingPeriod,
          periodBoundaries: {
            start: subscription.current_period_start,
            end: subscription.current_period_end,
          },
          rebuilt: {
            totalUnits: rebuilt.total_units,
            planUnits: rebuilt.plan_units,
            addonUnits: rebuilt.addon_units,
            creditUnits: rebuilt.credit_units,
            overrideUnits: rebuilt.override_units,
          },
          note: 'Projection is now linked to subscription ID for unambiguous billing period tracking',
        };
      },
    );
  }

  // ============================================
  // USE CASE 11: Full Debug Status
  // ============================================
  // Shows complete status for all quota features:
  // - Entitlement limits
  // - Current usage
  // - Remaining quota
  // Expected behavior:
  // - Returns comprehensive view for debugging
  // - Shows which features are approaching limits
  // Demonstrates:
  // - How entitlements + usage combine for quota enforcement
  // - What Phase 4 enforcement will check
  @Get('debug/full-status')
  @ApiOperation({
    summary: 'Full debug view: entitlements + usage + remaining',
  })
  @ApiResponse({ status: 200, description: 'Full status for all features' })
  async getFullStatus(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    // TODO: Phase 4 - Refactor to use single transaction after EntitlementResolverService.resolveAllForTenant() accepts QueryOptions
    // Currently uses separate transactions (one here, one in resolveAllForTenant).
    // This is safe for Phase 3 (read-only operations) but should be optimized in Phase 4.
    return this.databaseService.transactionWithTenantContext(
      user.tenantId,
      async (client) => {
        const subscription =
          await this.subscriptionsRepository.findActiveByTenantWithPlan(
            user.tenantId,
            { client },
          );

        if (!subscription) {
          throw new BadRequestException('No active subscription');
        }

        const billingPeriod = this.deriveBillingPeriod(
          subscription.current_period_start,
        );

        const { entitlements, plan } =
          await this.entitlementResolver.resolveAllForTenant(user.tenantId);

        // Get usage for all quota features
        const quotaFeatures: FeatureKey[] = [
          'documents_per_month',
          'contract_reviews_per_month',
          'regulatory_queries_per_month',
          'license_verifier_lookups',
        ];

        const status: {
          featureKey: FeatureKey;
          limit: string | number;
          used: number;
          remaining: string | number;
          source: UsageSource;
          atLimit: boolean;
        }[] = [];

        for (const featureKey of quotaFeatures) {
          const entitlement = entitlements[featureKey];
          if (!entitlement || entitlement.feature_type !== 'quota') continue;

          const usage = await this.usageProjectionService.getCurrentUsage(
            user.tenantId,
            subscription.id, // Use subscription ID
            featureKey,
            { client },
          );

          const limit = entitlement.value_int ?? 0;
          const used = usage?.total_units ?? 0;
          const remaining =
            limit === -1 ? 'unlimited' : Math.max(0, limit - used);

          status.push({
            featureKey,
            limit: limit === -1 ? 'unlimited' : limit,
            used,
            remaining,
            source: entitlement.source,
            atLimit: limit !== -1 && used >= limit,
          });
        }

        return {
          tenantId: user.tenantId,
          subscriptionId: subscription.id,
          plan,
          billingPeriod,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          quotaFeatures: status,
          note: 'Usage is now tracked per subscription (not calendar month) - handles mid-month subscription starts correctly',
        };
      },
    );
  }

  // ============================================
  // USE CASE 12: Simulate Exceeding Quota
  // ============================================
  // Simulates what happens when exceeding quota
  // Expected behavior:
  // - Phase 3: Records usage even if over quota (no enforcement)
  // - Phase 4: Will check quota and return 402 if exceeded
  // - Phase 4: Will offer credit fallback if available
  // Demonstrates:
  // - Current behavior (write-only, no enforcement)
  // - What Phase 4 will add (quota checks + credit fallback)
  @Post('simulate-exceed')
  @ApiOperation({
    summary: 'Simulate exceeding quota (demonstrates Phase 4 behavior)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage recorded (no enforcement in Phase 3)',
  })
  async simulateExceed(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('featureKey') featureKey: FeatureKey,
    @Body('units') units: number,
  ) {
    if (!featureKey || !units || units <= 0) {
      throw new BadRequestException('featureKey and units > 0 required');
    }

    // Get current entitlement and usage
    const subscription = await this.subscriptionsRepository.findActiveByTenant(
      user.tenantId,
    );
    if (!subscription) {
      throw new BadRequestException('No active subscription');
    }

    const entitlement = await this.entitlementResolver.resolveForTenant(
      user.tenantId,
      featureKey,
    );

    const usage = await this.usageProjectionService.getCurrentUsage(
      user.tenantId,
      subscription.id, // Use subscription ID
      featureKey,
    );

    const limit = entitlement?.value_int ?? 0;
    const used = usage?.total_units ?? 0;
    const remaining = limit === -1 ? Infinity : limit - used;
    const wouldExceed = limit !== -1 && used + units > limit;

    // Phase 3: Record anyway (no enforcement)
    const usageEvent = await this.usageIngestionService.recordUsage({
      tenant_id: user.tenantId,
      feature_key: featureKey,
      user_id: user.userId,
      units,
      source: 'plan',
      metadata: {
        test_scenario: 'simulate_exceed',
        wouldExceed,
      },
    });

    return {
      message: wouldExceed
        ? 'Usage recorded despite exceeding quota (Phase 3 has no enforcement)'
        : 'Usage recorded within quota',
      usageEventId: usageEvent.id,
      subscriptionId: subscription.id,
      featureKey,
      limit: limit === -1 ? 'unlimited' : limit,
      usedBefore: used,
      requested: units,
      usedAfter: used + units,
      remaining: remaining === Infinity ? 'unlimited' : remaining,
      wouldExceed,
      phase4Behavior: wouldExceed
        ? 'Would check credit balance and either deduct credits or return 402 Payment Required'
        : 'Would record usage normally',
      note: 'Usage is tracked per subscription (not calendar month) - handles mid-month starts correctly',
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  private deriveBillingPeriod(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}
