import { DatabaseService } from '@lib/database';
import { deriveBillingPeriod } from 'src/common/utils/billing.util';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  FeatureKey,
  UsageSource,
} from 'src/common/types/entitlement.types';
import { FeaturesRepository } from '../../repositories/features/features.repository';
import { SubscriptionsRepository } from '../../repositories/subscriptions/subscriptions.repository';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import { CreditBalanceService } from '../entitlements/services/credit-balance.service';
import { CreditLedgerService } from '../entitlements/services/credit-ledger.service';
import { EntitlementEnforcementService } from '../entitlements/services/entitlement-enforcement.service';
import { EntitlementResolverService } from '../entitlements/services/entitlement-resolver.service';
import { UsageProjectionService } from '../entitlements/services/usage-projection.service';

/**
 * Credits Mock Controller - Phase 4 Test Cases
 *
 * This controller demonstrates all credit ledger and enforcement patterns:
 * - Credit purchases and grants
 * - Balance queries and breakdowns
 * - Transaction history
 * - Enforcement with credit fallback (the core Phase 4 feature)
 * - Quota enforcement scenarios (within quota, exceeded with credits, exceeded without credits)
 * - Non-creditable feature enforcement
 * - Unlimited feature handling
 * - Boolean feature pass-through
 *
 * Test Tenants (from seed 008):
 * - Tenant 1 (general_counsel): 100 documents/month, 30 contract reviews
 * - Tenant 2 (shield + addon): 25 + 50 = 75 documents/month, 5 contract reviews
 * - Tenant 3 (infrastructure + override): 500 documents (override), unlimited reviews
 *
 * Phase 4 Flow:
 * 1. Purchase credits → credit_ledger.purchase
 * 2. Attempt usage → EntitlementEnforcementService.checkAndRecord()
 * 3. If exceeded + creditable + credits available → deduct credits + record with source='credit'
 * 4. If exceeded + no credits → deny with 402 (simulated in mock, actual in guard)
 *
 * TODO: BullMQ - In production, credit operations would trigger async jobs:
 * 1. credit.purchased → email receipt
 * 2. credit.deducted → check if balance < threshold → email low balance alert
 * 3. quota.exceeded → email upgrade prompt to tenant admin
 */
@ApiExcludeController()
@Controller('mock/credits')
@AuthOptions({ tenant: true })
@ApiTags('mock-credits')
export class CreditsMockController {
  constructor(
    private readonly creditLedgerService: CreditLedgerService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly enforcementService: EntitlementEnforcementService,
    private readonly entitlementResolver: EntitlementResolverService,
    private readonly usageProjectionService: UsageProjectionService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly featuresRepository: FeaturesRepository,
    private readonly databaseService: DatabaseService,
  ) {}

  // ============================================
  // USE CASE 1: Purchase Credits
  // ============================================
  // Records a credit purchase transaction
  // Expected behavior:
  // - Increases balance by the purchased amount
  // - Records transaction with transaction_type='purchase'
  // - Returns new balance
  // What could go wrong:
  // - amount <= 0 → 400 error
  @Post('purchase')
  @ApiOperation({ summary: 'Purchase credits' })
  @ApiResponse({ status: 200, description: 'Credits purchased' })
  @ApiResponse({ status: 400, description: 'Invalid amount' })
  async purchaseCredits(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('amount') amount: number,
  ) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const transaction = await this.creditLedgerService.purchase({
      tenantId: user.tenantId,
      amount,
      metadata: {
        test_scenario: 'purchase',
        user_id: user.userId,
      },
    });

    return {
      message: `${amount} credits purchased`,
      transactionId: transaction.id,
      tenantId: user.tenantId,
      amount,
      balanceAfter: transaction.balance_after,
      recordedAt: transaction.recorded_at,
      note: 'Credits are now available for use when quota is exceeded',
    };
  }

  // ============================================
  // USE CASE 2: Grant Credits (Admin)
  // ============================================
  // Records a promotional credit grant
  // Expected behavior:
  // - Increases balance by the granted amount
  // - Records transaction with transaction_type='grant'
  // - Supports optional expiry date
  // What could go wrong:
  // - amount <= 0 → 400 error
  @Post('grant')
  @ApiOperation({ summary: 'Grant credits (admin/promotional)' })
  @ApiResponse({ status: 200, description: 'Credits granted' })
  @ApiResponse({ status: 400, description: 'Invalid amount' })
  async grantCredits(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('amount') amount: number,
    @Body('reason') reason: string,
    @Body('expiresAt') expiresAt?: string,
  ) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    if (!reason) {
      throw new BadRequestException('Reason is required');
    }

    const transaction = await this.creditLedgerService.grant({
      tenantId: user.tenantId,
      amount,
      reason,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      appliedBy: user.userId,
      metadata: {
        test_scenario: 'grant',
      },
    });

    return {
      message: `${amount} credits granted`,
      transactionId: transaction.id,
      tenantId: user.tenantId,
      amount,
      reason,
      expiresAt: transaction.expires_at,
      balanceAfter: transaction.balance_after,
      recordedAt: transaction.recorded_at,
      note: 'Granted credits can have expiry dates',
    };
  }

  // ============================================
  // USE CASE 3: Check Credit Balance
  // ============================================
  // Returns current credit balance (excludes expired)
  // Expected behavior:
  // - Returns sum of all non-expired credit transactions
  // - Fast read from ledger
  @Get('balance')
  @ApiOperation({ summary: 'Get current credit balance' })
  @ApiResponse({ status: 200, description: 'Current balance' })
  async getBalance(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const balance = await this.creditBalanceService.getAvailableBalance(
      user.tenantId,
    );

    return {
      tenantId: user.tenantId,
      balance,
      note: 'Balance excludes expired credits',
    };
  }

  // ============================================
  // USE CASE 4: Balance Breakdown
  // ============================================
  // Returns balance breakdown by transaction type
  // Expected behavior:
  // - Shows purchased, granted, deducted, refunded, expired totals
  // - Net balance = sum of all types
  // Demonstrates:
  // - Credit ledger as source of truth
  // - Breakdown for analytics and debugging
  @Get('balance/breakdown')
  @ApiOperation({ summary: 'Get balance breakdown by transaction type' })
  @ApiResponse({ status: 200, description: 'Balance breakdown' })
  async getBalanceBreakdown(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    const breakdown = await this.creditBalanceService.getBalanceBreakdown(
      user.tenantId,
    );

    return {
      tenantId: user.tenantId,
      breakdown,
      note: 'Breakdown shows totals by transaction type (deducted and expired are negative)',
    };
  }

  // ============================================
  // USE CASE 5: Credit Transaction History
  // ============================================
  // Returns paginated credit ledger entries
  // Expected behavior:
  // - Returns transactions ordered by recorded_at DESC
  // - Supports cursor pagination
  // Demonstrates:
  // - Audit trail for credit transactions
  // - Ledger as source of truth
  @Get('history')
  @ApiOperation({ summary: 'Get credit transaction history' })
  @ApiResponse({ status: 200, description: 'Transaction history' })
  async getTransactionHistory(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    const transactions = await this.creditLedgerService.getTransactionHistory(
      user.tenantId,
      50, // limit
    );

    return {
      tenantId: user.tenantId,
      count: transactions.length,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.transaction_type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        featureId: t.feature_id,
        usageLedgerId: t.usage_ledger_id,
        reason: t.reason,
        appliedBy: t.applied_by,
        expiresAt: t.expires_at,
        recordedAt: t.recorded_at,
      })),
      note: 'Transactions are append-only and immutable',
    };
  }

  // ============================================
  // USE CASE 6: Enforce Usage Within Quota (No Credits Needed)
  // ============================================
  // Records usage through enforcement service when within quota
  // Expected behavior:
  // - Tenant 1: Success (within 100 limit)
  // - Tenant 2: Success (within 75 limit)
  // - Tenant 3: Success (unlimited)
  // - Returns {allowed: true, source: 'plan', remaining: N}
  // Demonstrates:
  // - Happy path enforcement
  // - No credit deduction when within quota
  @Post('enforce/within-quota')
  @ApiOperation({
    summary: 'Enforce usage within quota (no credits needed)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage allowed and recorded with plan source',
  })
  async enforceWithinQuota(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const result = await this.enforcementService.checkAndRecord({
      tenantId: user.tenantId,
      featureKey: 'documents_per_month',
      userId: user.userId,
      units: 1,
      metadata: {
        test_scenario: 'within_quota',
      },
    });

    return {
      message: 'Usage allowed (within quota)',
      tenantId: user.tenantId,
      featureKey: 'documents_per_month',
      result,
      note: 'No credits were deducted because usage was within plan quota',
    };
  }

  // ============================================
  // USE CASE 7: Enforce Usage Exceeding Quota WITH Credits
  // ============================================
  // Demonstrates credit fallback when quota is exceeded
  // Expected behavior:
  // 1. Purchase credits first
  // 2. Record usage that exceeds quota
  // 3. Credits are deducted automatically
  // 4. Usage is recorded with source='credit'
  // 5. Returns {allowed: true, source: 'credit', creditsRemaining: N}
  // Demonstrates:
  // - THE KEY PHASE 4 FEATURE: automatic credit fallback
  // - Credit deduction linked to usage event
  // - Source attribution in usage_ledger
  @Post('enforce/exceed-with-credits')
  @ApiOperation({
    summary: 'Enforce usage exceeding quota WITH credits available',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage allowed via credit fallback',
  })
  async enforceExceedWithCredits(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('purchaseAmount') purchaseAmount?: number,
  ) {
    const creditAmount = purchaseAmount ?? 10;
    let limit = 0;
    let used = 0;
    let remaining = 0;
    let unitsToExceed = 0;

    const result = await this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Step 1: Purchase credits first (if amount provided)
        await this.creditLedgerService.purchase(
          {
            tenantId: user.tenantId,
            amount: creditAmount,
            metadata: {
              test_scenario: 'setup_for_exceed_test',
            },
          },
          { client },
        );

        // Step 2: Get current usage to see how close we are to the limit
        const subscription =
          await this.subscriptionsRepository.findActiveByTenant(user.tenantId, {
            client,
          });
        if (!subscription) {
          throw new BadRequestException('No active subscription');
        }

        const usage = await this.usageProjectionService.getCurrentUsage(
          user.tenantId,
          subscription.id,
          'documents_per_month',
          deriveBillingPeriod(subscription.current_period_start),
          { client },
        );

        const entitlement = await this.entitlementResolver.resolveForTenant(
          user.tenantId,
          'documents_per_month',
          { client },
        );

        limit = entitlement?.value_int ?? 0;
        used = usage?.total_units ?? 0;
        remaining = limit === -1 ? Infinity : limit - used;

        // Step 3: Record enough usage to exceed the quota
        unitsToExceed = remaining < Infinity ? Math.ceil(remaining) + 1 : 1;

        return this.enforcementService.checkAndRecord(
          {
            tenantId: user.tenantId,
            featureKey: 'documents_per_month',
            userId: user.userId,
            units: unitsToExceed,
            metadata: { test_scenario: 'exceed_with_credits' },
          },
          { client },
        );
      },
    );

    return {
      message: result.allowed
        ? 'Usage allowed via credit fallback'
        : 'Usage denied (unexpected)',
      tenantId: user.tenantId,
      featureKey: 'documents_per_month',
      setup: {
        creditsPurchased: creditAmount,
        limitBefore: limit === -1 ? 'unlimited' : limit,
        usedBefore: used,
        remainingBefore: remaining === Infinity ? 'unlimited' : remaining,
        unitsRequested: unitsToExceed,
      },
      result,
      note: 'Credits were automatically deducted because quota was exceeded',
    };
  }

  // ============================================
  // USE CASE 8: Enforce Usage Exceeding Quota WITHOUT Credits
  // ============================================
  // Demonstrates denial when quota is exceeded and no credits available
  // Expected behavior:
  // 1. Attempt usage that exceeds quota
  // 2. No credits available
  // 3. Returns {allowed: false, reason: 'quota_exceeded'}
  // Demonstrates:
  // - Denial flow when no credit fallback available
  // - What would trigger 402 Payment Required in the guard
  @Post('enforce/exceed-no-credits')
  @ApiOperation({
    summary: 'Enforce usage exceeding quota WITHOUT credits',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage denied (quota exceeded, no credits)',
  })
  async enforceExceedNoCredits(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    let limit = 0;
    let used = 0;
    let remaining = 0;
    let unitsToExceed = 0;
    const result = await this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Get current state
        const subscription =
          await this.subscriptionsRepository.findActiveByTenant(user.tenantId, {
            client,
          });
        if (!subscription) {
          throw new BadRequestException('No active subscription');
        }

        const usage = await this.usageProjectionService.getCurrentUsage(
          user.tenantId,
          subscription.id,
          'documents_per_month',
          deriveBillingPeriod(subscription.current_period_start),
          { client },
        );

        const entitlement = await this.entitlementResolver.resolveForTenant(
          user.tenantId,
          'documents_per_month',
          { client },
        );

        limit = entitlement?.value_int ?? 0;
        used = usage?.total_units ?? 0;
        remaining = limit === -1 ? Infinity : limit - used;
        unitsToExceed = remaining < Infinity ? Math.ceil(remaining) + 1 : 1;

        return this.enforcementService.checkAndRecord(
          {
            tenantId: user.tenantId,
            featureKey: 'documents_per_month',
            userId: user.userId,
            units: unitsToExceed,
            metadata: {
              test_scenario: 'exceed_no_credits',
            },
          },
          { client },
        );
      },
    );
    return {
      message: result.allowed
        ? 'Usage allowed (unexpected - should be denied)'
        : 'Usage denied (quota exceeded, no credits)',
      tenantId: user.tenantId,
      featureKey: 'documents_per_month',
      state: {
        limit: limit === -1 ? 'unlimited' : limit,
        used,
        remaining: remaining === Infinity ? 'unlimited' : remaining,
        unitsRequested: unitsToExceed,
        creditBalance: result.creditsRemaining ?? 0,
      },
      result,
      guardBehavior: result.allowed
        ? 'Would allow request'
        : 'Would throw 402 Payment Required with upgrade prompt',
      note: 'In a real endpoint with UsageEnforcementGuard, this would return 402',
    };
  }

  // ============================================
  // USE CASE 9: Enforce Usage on Non-Creditable Feature
  // ============================================
  // Demonstrates that non-creditable features cannot use credit fallback
  // Expected behavior:
  // - license_verifier_lookups has creditable=false
  // - Even if credits are available, cannot exceed quota
  // - Returns {allowed: false, reason: 'quota_exceeded'}
  // Demonstrates:
  // - creditable flag enforcement
  // - Feature-specific credit policies
  @Post('enforce/non-creditable')
  @ApiOperation({
    summary: 'Enforce usage on non-creditable feature (no credit fallback)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage denied (feature not creditable)',
  })
  async enforceNonCreditable(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    let limit = 0;
    let used = 0;
    let remaining = 0;
    let unitsToExceed = 0;
    let creditBalance = 0;
    const result = await this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Purchase credits first (to prove they won't be used)
        await this.creditLedgerService.purchase(
          {
            tenantId: user.tenantId,
            amount: 100,
            metadata: {
              test_scenario: 'non_creditable_test',
            },
          },
          { client },
        );

        creditBalance = await this.creditBalanceService.getAvailableBalance(
          user.tenantId,
          {
            client,
          },
        );

        // Get current state for license_verifier_lookups
        const subscription =
          await this.subscriptionsRepository.findActiveByTenant(user.tenantId, {
            client,
          });
        if (!subscription) {
          throw new BadRequestException('No active subscription');
        }

        const usage = await this.usageProjectionService.getCurrentUsage(
          user.tenantId,
          subscription.id,
          'license_verifier_lookups',
          deriveBillingPeriod(subscription.current_period_start),
          { client },
        );

        const entitlement = await this.entitlementResolver.resolveForTenant(
          user.tenantId,
          'license_verifier_lookups',
          { client },
        );

        limit = entitlement?.value_int ?? 0;
        used = usage?.total_units ?? 0;
        remaining = limit === -1 ? Infinity : limit - used;
        unitsToExceed = remaining < Infinity ? Math.ceil(remaining) + 1 : 1;

        return this.enforcementService.checkAndRecord(
          {
            tenantId: user.tenantId,
            featureKey: 'license_verifier_lookups',
            userId: user.userId,
            units: unitsToExceed,
            metadata: {
              test_scenario: 'non_creditable',
            },
          },
          { client },
        );
      },
    );

    return {
      message: result.allowed
        ? 'Usage allowed (unexpected - should be denied)'
        : 'Usage denied (feature not creditable)',
      tenantId: user.tenantId,
      featureKey: 'license_verifier_lookups',
      state: {
        limit: limit === -1 ? 'unlimited' : limit,
        used,
        remaining: remaining === Infinity ? 'unlimited' : remaining,
        unitsRequested: unitsToExceed,
        creditBalance,
        featureCreditable: false,
      },
      result,
      note: 'Credits were NOT used because license_verifier_lookups has creditable=false',
    };
  }

  // ============================================
  // USE CASE 10: Enforce Usage on Unlimited Feature
  // ============================================
  // Demonstrates that unlimited features never trigger credit deduction
  // Expected behavior:
  // - Infrastructure tenant has unlimited documents (value_int=-1)
  // - Usage is always allowed
  // - No credit deduction
  // - Returns {allowed: true, source: 'plan', remaining: -1}
  // Demonstrates:
  // - Unlimited feature handling
  // - No credit deduction for unlimited
  @Post('enforce/unlimited')
  @ApiOperation({
    summary: 'Enforce usage on unlimited feature (no credit deduction)',
  })
  @ApiResponse({ status: 200, description: 'Usage always allowed' })
  async enforceUnlimited(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const largeUsage = 1000; // Test with large usage for unlimited feature
    const result = await this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // This test only makes sense for Infrastructure tenant (unlimited documents)
        const entitlement = await this.entitlementResolver.resolveForTenant(
          user.tenantId,
          'documents_per_month',
          { client },
        );

        const limit = entitlement?.value_int ?? 0;

        if (limit !== -1) {
          return {
            message: 'Skipping test (tenant does not have unlimited documents)',
            tenantId: user.tenantId,
            limit,
            note: 'Switch to Infrastructure tenant (Tenant 3) to test unlimited features',
          };
        }

        // Record large usage (should always succeed)
        return this.enforcementService.checkAndRecord(
          {
            tenantId: user.tenantId,
            featureKey: 'documents_per_month',
            userId: user.userId,
            units: largeUsage,
            metadata: {
              test_scenario: 'unlimited',
            },
          },
          { client },
        );
      },
    );
    return {
      message: 'Usage allowed (unlimited feature)',
      tenantId: user.tenantId,
      featureKey: 'documents_per_month',
      unitsRequested: largeUsage,
      result,
      note: 'Unlimited features never trigger credit deduction',
    };
  }

  // ============================================
  // USE CASE 11: Enforce Boolean Feature (No Usage Tracking)
  // ============================================
  // Demonstrates that boolean features pass through without usage tracking
  // Expected behavior:
  // - Boolean features return {allowed: true/false} based on value_bool
  // - No usage is recorded
  // - No credits are involved
  // Demonstrates:
  // - Boolean feature enforcement
  // - Different code path than quota features
  @Post('enforce/boolean')
  @ApiOperation({
    summary: 'Enforce boolean feature (no usage tracking)',
  })
  @ApiResponse({ status: 200, description: 'Boolean check result' })
  async enforceBoolean(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('featureKey') featureKey: FeatureKey,
  ) {
    if (!featureKey) {
      throw new BadRequestException('featureKey is required');
    }

    const result = await this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        const entitlement = await this.entitlementResolver.resolveForTenant(
          user.tenantId,
          featureKey,
          { client },
        );

        if (!entitlement || entitlement.feature_type !== 'boolean') {
          throw new BadRequestException(
            `${featureKey} is not a boolean feature`,
          );
        }

        return this.enforcementService.checkAndRecord(
          {
            tenantId: user.tenantId,
            featureKey,
            userId: user.userId,
            units: 1,
            metadata: {
              test_scenario: 'boolean',
            },
          },
          { client },
        );
      },
    );
    return {
      message: result.allowed
        ? 'Boolean feature enabled'
        : 'Boolean feature disabled',
      tenantId: user.tenantId,
      featureKey,
      result,
      note: 'Boolean features do not record usage or consume credits',
    };
  }

  // ============================================
  // USE CASE 12: Full Enforcement Debug Status
  // ============================================
  // Shows complete enforcement state for all quota features
  // Expected behavior:
  // - Returns entitlements + usage + credit balance + effective remaining
  // - For each quota feature:
  //   - limit, used, remaining (from quota)
  //   - creditable flag
  //   - credit balance
  //   - effective remaining (quota remaining + credits if creditable)
  // Demonstrates:
  // - Complete system state for debugging
  // - How credits extend effective capacity
  @Get('debug/enforcement-status')
  @ApiOperation({
    summary: 'Full enforcement debug: entitlements + usage + credits',
  })
  @ApiResponse({ status: 200, description: 'Full enforcement status' })
  async getEnforcementStatus(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        const subscription =
          await this.subscriptionsRepository.findActiveByTenant(user.tenantId, {
            client,
          });

        if (!subscription) {
          throw new BadRequestException('No active subscription');
        }

        const { entitlements, plan } =
          await this.entitlementResolver.resolveAllForTenant(user.tenantId, {
            client,
          });

        const creditBalance =
          await this.creditBalanceService.getAvailableBalance(user.tenantId, {
            client,
          });

        // Get status for all quota features
        const quotaFeatures: FeatureKey[] = [
          'documents_per_month',
          'contract_reviews_per_month',
          'regulatory_queries_per_month',
          'license_verifier_lookups',
        ];

        const status: Array<{
          featureKey: FeatureKey;
          limit: number | 'unlimited';
          used: number;
          remaining: number | 'unlimited';
          creditable: boolean;
          creditBalance: number | 'N/A';
          effectiveRemaining: string | number;
          source: UsageSource;
          atLimit: boolean;
        }> = [];

        for (const featureKey of quotaFeatures) {
          const entitlement = entitlements[featureKey];
          if (!entitlement || entitlement.feature_type !== 'quota') continue;

          const usage = await this.usageProjectionService.getCurrentUsage(
            user.tenantId,
            subscription.id,
            featureKey,
            deriveBillingPeriod(subscription.current_period_start),
            { client },
          );

          const feature = await this.featuresRepository.findByKey(featureKey, {
            client,
          });

          const limit = entitlement.value_int ?? 0;
          const used = usage?.total_units ?? 0;
          const remaining =
            limit === -1 ? 'unlimited' : Math.max(0, limit - used);
          const creditable = feature?.creditable ?? false;

          // Effective remaining = quota remaining + credits (if creditable)
          let effectiveRemaining: string | number = remaining;
          if (creditable && remaining !== 'unlimited') {
            effectiveRemaining = remaining + creditBalance;
          }

          status.push({
            featureKey,
            limit: limit === -1 ? 'unlimited' : limit,
            used,
            remaining,
            creditable,
            creditBalance: creditable ? creditBalance : 'N/A',
            effectiveRemaining: creditable ? effectiveRemaining : remaining,
            source: entitlement.source,
            atLimit: limit !== -1 && used >= limit,
          });
        }

        return {
          tenantId: user.tenantId,
          plan,
          creditBalance,
          quotaFeatures: status,
          note: 'effectiveRemaining = remaining + creditBalance (if creditable)',
        };
      },
    );
  }
}
