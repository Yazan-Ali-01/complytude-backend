import { DatabaseService } from '@lib/database';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireEntitlement } from 'src/common/decorators/require-entitlement.decorator';
import { TrackUsage } from 'src/common/decorators/track-usage.decorator';
import { EntitlementGuard } from 'src/common/guards/entitlement.guard';
import { UsageEnforcementGuard } from 'src/common/guards/usage-enforcement.guard';
import { SubscriptionsRepository } from '../../repositories/subscriptions/subscriptions.repository';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import { CreditBalanceService } from '../entitlements/services/credit-balance.service';
import { CreditLedgerService } from '../entitlements/services/credit-ledger.service';
import { EntitlementResolverService } from '../entitlements/services/entitlement-resolver.service';
import { UsageProjectionService } from '../entitlements/services/usage-projection.service';

/**
 * Enforcement Mock Controller - Phase 5 Test Cases
 *
 * This controller demonstrates GUARD-LEVEL ENFORCEMENT -- the actual decorator + guard pattern
 * that real feature endpoints will use. This is different from existing mocks which call services directly.
 *
 * Key Pattern:
 * - Existing mocks (Phase 3-4): Call services directly and return raw results
 * - This mock (Phase 5): Uses @UseGuards() decorators -- guards intercept before endpoint is reached
 *
 * Guard Behaviors:
 * - EntitlementGuard: Throws 403 Forbidden if entitlement check fails
 * - UsageEnforcementGuard: Throws 402 Payment Required if quota exceeded, attaches request.usageResult on success
 *
 * Test Scenarios:
 * 1. Boolean entitlement via guard (redlining_enabled)
 * 2. Tiered text entitlement via guard (template_library = 'full')
 * 3. Quota tracking via guard (within quota)
 * 4. Quota tracking via guard (exceed + credit fallback)
 * 5. Bulk usage via guard (5 units)
 * 6. Combined guards (EntitlementGuard + UsageEnforcementGuard)
 * 7. Non-creditable quota exceeded (contract_reviews_per_month)
 * 8. Debug endpoint (show enforcement state without guards)
 *
 * Test Tenants (from seed 008):
 * - Tenant 1 (general_counsel): 100 documents/month, 30 contract reviews
 * - Tenant 2 (shield + addon): 25 + 50 = 75 documents/month, 5 contract reviews
 * - Tenant 3 (infrastructure + override): 500 documents (override), unlimited reviews
 *
 * Expected Guard Behavior:
 * - If guard passes: Endpoint is reached, returns 200 with data
 * - If guard fails: Endpoint is NOT reached, guard throws exception (403 or 402)
 */
@Controller('mock/enforcement')
@AuthOptions({ tenant: true })
@ApiTags('mock-enforcement')
export class EnforcementMockController {
  constructor(
    private readonly entitlementResolver: EntitlementResolverService,
    private readonly usageProjectionService: UsageProjectionService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly creditLedgerService: CreditLedgerService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly databaseService: DatabaseService,
  ) {}

  // ============================================
  // USE CASE 1: Boolean Entitlement via Guard
  // ============================================
  // Guard checks: redlining_enabled = true
  // Passes: general_counsel, infrastructure (have redlining)
  // Fails: navigator, shield (redlining disabled) → 403 Forbidden
  @Post('redlining/analyze')
  @UseGuards(EntitlementGuard)
  @RequireEntitlement('redlining_enabled')
  @ApiOperation({
    summary: 'Test redlining feature (boolean entitlement via guard)',
  })
  @ApiResponse({
    status: 200,
    description: 'Redlining enabled - endpoint reached',
  })
  @ApiResponse({
    status: 403,
    description: 'Redlining not enabled - guard blocked request',
  })
  testRedliningViaGuard(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `✅ Redlining endpoint reached by ${user.email}`,
      feature: 'redlining_enabled',
      status: 'enabled',
      guardBehavior: 'EntitlementGuard passed - boolean check succeeded',
      note: 'If you see this response, the guard allowed the request. If redlining is disabled, you would get 403 before reaching this endpoint.',
    };
  }

  // ============================================
  // USE CASE 2: Tiered Text Entitlement via Guard
  // ============================================
  // Guard checks: template_library = 'full'
  // Passes: general_counsel, infrastructure (have 'full')
  // Fails: navigator, shield (have 'essential') → 403 Forbidden
  @Get('templates/premium')
  @UseGuards(EntitlementGuard)
  @RequireEntitlement({ featureKey: 'template_library', value_text: 'full' })
  @ApiOperation({
    summary: 'Test template library tier (text entitlement via guard)',
  })
  @ApiResponse({
    status: 200,
    description: 'Full template library access - endpoint reached',
  })
  @ApiResponse({
    status: 403,
    description: 'Only essential templates available - guard blocked request',
  })
  testFullTemplateLibraryViaGuard(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    return {
      message: `✅ Premium templates endpoint reached by ${user.email}`,
      feature: 'template_library',
      tier: 'full',
      guardBehavior: 'EntitlementGuard passed - text value matched',
      note: 'If you see this response, the guard allowed the request. If template_library is not "full", you would get 403 before reaching this endpoint.',
    };
  }

  // ============================================
  // USE CASE 3: Quota Tracking via Guard (Within Quota)
  // ============================================
  // Guard checks: documents_per_month quota and records usage
  // Behavior:
  // - If within quota: Records usage with source='plan', attaches request.usageResult, returns 200
  // - If exceeded + credits: Records usage with source='credit', deducts credits, returns 200
  // - If exceeded + no credits: Returns 402 Payment Required (guard blocks)
  @Post('documents/generate')
  @UseGuards(UsageEnforcementGuard)
  @TrackUsage('documents_per_month')
  @ApiOperation({
    summary: 'Test document generation (quota tracking via guard)',
  })
  @ApiResponse({
    status: 200,
    description: 'Document generated - quota available or credits used',
  })
  @ApiResponse({
    status: 402,
    description: 'Quota exceeded and no credits - guard blocked request',
  })
  testDocumentGenerationViaGuard(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Req() request: any,
  ) {
    // UsageEnforcementGuard attaches usageResult to request on success
    const usageResult = request.usageResult;

    return {
      message: `✅ Document generated by ${user.email}`,
      feature: 'documents_per_month',
      usageResult,
      guardBehavior:
        'UsageEnforcementGuard passed - quota available or credits used',
      note: 'If you see this response, the guard allowed the request and recorded usage. If quota is exceeded and no credits, you would get 402 before reaching this endpoint.',
    };
  }

  // ============================================
  // USE CASE 4: Quota Tracking via Guard (Credit Fallback)
  // ============================================
  // Same as USE CASE 3, but demonstrates credit fallback explicitly
  // To test credit fallback:
  // 1. Exhaust quota (call this endpoint until quota is used up)
  // 2. Purchase credits via POST /mock/credits/purchase
  // 3. Call this endpoint again - should use credits instead of quota
  @Post('documents/generate-with-credits')
  @UseGuards(UsageEnforcementGuard)
  @TrackUsage('documents_per_month')
  @ApiOperation({
    summary:
      'Test document generation with credit fallback (quota tracking via guard)',
  })
  @ApiResponse({
    status: 200,
    description: 'Document generated - used plan quota or credits',
  })
  @ApiResponse({
    status: 402,
    description: 'Quota exceeded and no credits - guard blocked request',
  })
  testDocumentGenerationWithCreditsViaGuard(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Req() request: any,
  ) {
    const usageResult = request.usageResult;

    return {
      message: `✅ Document generated by ${user.email}`,
      feature: 'documents_per_month',
      usageResult,
      creditFallback:
        usageResult.source === 'credit'
          ? 'Credits were used (quota exceeded)'
          : 'Plan quota was used',
      guardBehavior:
        usageResult.source === 'credit'
          ? 'UsageEnforcementGuard used credit fallback'
          : 'UsageEnforcementGuard used plan quota',
      note: 'Check usageResult.source to see if credits were used. If "credit", the guard deducted credits after quota was exceeded.',
    };
  }

  // ============================================
  // USE CASE 5: Bulk Usage via Guard (5 units)
  // ============================================
  // Guard checks: documents_per_month quota and records 5 units
  // Tests multi-unit consumption in a single request
  @Post('documents/bulk-generate')
  @UseGuards(UsageEnforcementGuard)
  @TrackUsage('documents_per_month', 5)
  @ApiOperation({
    summary: 'Test bulk document generation (5 units via guard)',
  })
  @ApiResponse({
    status: 200,
    description: '5 documents generated - quota available',
  })
  @ApiResponse({
    status: 402,
    description: 'Insufficient quota for 5 documents - guard blocked request',
  })
  testBulkDocumentGenerationViaGuard(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Req() request: any,
  ) {
    const usageResult = request.usageResult;

    return {
      message: `✅ Bulk generation (5 documents) by ${user.email}`,
      feature: 'documents_per_month',
      unitsConsumed: 5,
      usageResult,
      guardBehavior: 'UsageEnforcementGuard checked and recorded 5 units',
      note: 'This endpoint consumes 5 units in a single request. Check usageResult.used to see total usage.',
    };
  }

  // ============================================
  // USE CASE 6: Combined Guards (Entitlement + Usage)
  // ============================================
  // First guard: EntitlementGuard checks redlining_enabled = true
  // Second guard: UsageEnforcementGuard checks and records contract_reviews_per_month
  // Both guards must pass for endpoint to be reached
  @Post('contracts/redline-and-review')
  @UseGuards(EntitlementGuard, UsageEnforcementGuard)
  @RequireEntitlement('redlining_enabled')
  @TrackUsage('contract_reviews_per_month')
  @ApiOperation({
    summary: 'Test combined guards (entitlement + usage)',
  })
  @ApiResponse({
    status: 200,
    description: 'Both guards passed - redlining enabled and quota available',
  })
  @ApiResponse({
    status: 403,
    description: 'EntitlementGuard failed - redlining not enabled',
  })
  @ApiResponse({
    status: 402,
    description: 'UsageEnforcementGuard failed - quota exceeded',
  })
  testCombinedGuards(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Req() request: any,
  ) {
    const usageResult = request.usageResult;

    return {
      message: `✅ Contract redlined and reviewed by ${user.email}`,
      feature: 'contract_reviews_per_month',
      entitlementCheck: 'redlining_enabled = true',
      usageResult,
      guardBehavior:
        'Both guards passed - EntitlementGuard checked boolean, UsageEnforcementGuard tracked usage',
      note: 'This endpoint requires both redlining feature AND available contract review quota. Guards execute in order: EntitlementGuard first, then UsageEnforcementGuard.',
    };
  }

  // ============================================
  // USE CASE 7: Non-Creditable Quota Exceeded
  // ============================================
  // Guard checks: contract_reviews_per_month (NOT creditable by default)
  // Behavior:
  // - If within quota: Records usage, returns 200
  // - If exceeded: Returns 402 (no credit fallback available)
  @Post('contracts/analyze')
  @UseGuards(UsageEnforcementGuard)
  @TrackUsage('contract_reviews_per_month')
  @ApiOperation({
    summary: 'Test non-creditable quota (contract reviews via guard)',
  })
  @ApiResponse({
    status: 200,
    description: 'Contract analyzed - quota available',
  })
  @ApiResponse({
    status: 402,
    description:
      'Quota exceeded - guard blocked request (no credit fallback for this feature)',
  })
  testNonCreditableQuotaViaGuard(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Req() request: any,
  ) {
    const usageResult = request.usageResult;

    return {
      message: `✅ Contract analyzed by ${user.email}`,
      feature: 'contract_reviews_per_month',
      usageResult,
      guardBehavior:
        'UsageEnforcementGuard passed - quota available (no credit fallback for this feature)',
      note: 'contract_reviews_per_month is NOT creditable. If quota is exceeded, you get 402 with no option to use credits.',
    };
  }

  // ============================================
  // USE CASE 8: Debug - Show Enforcement State
  // ============================================
  // No guards - just returns current enforcement state for debugging
  // Shows: entitlements, usage, credits for the tenant
  @Get('debug/enforcement-state')
  @ApiOperation({ summary: 'Debug: Show current enforcement state' })
  @ApiResponse({
    status: 200,
    description: 'Current enforcement state for tenant',
  })
  async debugEnforcementState(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        const { entitlements, plan } =
          await this.entitlementResolver.resolveAllForTenant(user.tenantId, {
            client,
          });

        const subscription =
          await this.subscriptionsRepository.findActiveByTenant(user.tenantId, {
            client,
          });

        if (!subscription) {
          throw new BadRequestException('No active subscription found');
        }

        // Get usage for key features
        const documentsUsage =
          await this.usageProjectionService.getCurrentUsage(
            user.tenantId,
            subscription.id,
            'documents_per_month',
            { client },
          );

        const contractReviewsUsage =
          await this.usageProjectionService.getCurrentUsage(
            user.tenantId,
            subscription.id,
            'contract_reviews_per_month',
            { client },
          );

        // Get credit balance
        const creditBalance =
          await this.creditBalanceService.getAvailableBalance(user.tenantId, {
            client,
          });

        const creditBreakdown =
          await this.creditBalanceService.getBalanceBreakdown(user.tenantId, {
            client,
          });

        return {
          tenantId: user.tenantId,
          plan,
          subscription: {
            id: subscription.id,
            status: subscription.status,
            currentPeriod: {
              start: subscription.current_period_start,
              end: subscription.current_period_end,
            },
          },
          entitlements: {
            documents_per_month: entitlements.documents_per_month,
            contract_reviews_per_month: entitlements.contract_reviews_per_month,
            redlining_enabled: entitlements.redlining_enabled,
            template_library: entitlements.template_library,
          },
          usage: {
            documents: documentsUsage
              ? {
                  total: documentsUsage.total_units,
                  plan: documentsUsage.plan_units,
                  addon: documentsUsage.addon_units,
                  credit: documentsUsage.credit_units,
                }
              : { total: 0, plan: 0, addon: 0, credit: 0 },
            contractReviews: contractReviewsUsage
              ? {
                  total: contractReviewsUsage.total_units,
                  plan: contractReviewsUsage.plan_units,
                  addon: contractReviewsUsage.addon_units,
                  credit: contractReviewsUsage.credit_units,
                }
              : { total: 0, plan: 0, addon: 0, credit: 0 },
          },
          credits: {
            balance: creditBalance,
            breakdown: creditBreakdown,
          },
          note: 'Use this endpoint to inspect current enforcement state before testing guard scenarios.',
        };
      },
    );
  }

  // ============================================
  // USE CASE 9: Helper - Purchase Credits for Testing
  // ============================================
  // Helper endpoint to purchase credits for testing credit fallback scenarios
  @Post('debug/purchase-credits')
  @ApiOperation({ summary: 'Debug: Purchase credits for testing' })
  @ApiResponse({ status: 200, description: 'Credits purchased' })
  async debugPurchaseCredits(
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
        test_scenario: 'debug_purchase',
        user_id: user.userId,
      },
    });

    const newBalance = await this.creditBalanceService.getAvailableBalance(
      user.tenantId,
    );

    return {
      message: `✅ ${amount} credits purchased`,
      transactionId: transaction.id,
      newBalance,
      note: 'Use this endpoint to add credits before testing credit fallback scenarios.',
    };
  }
}
