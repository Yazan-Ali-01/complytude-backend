import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireEntitlement } from 'src/common/decorators/require-entitlement.decorator';
import { EntitlementGuard } from 'src/common/guards/entitlement.guard';
import type { FeatureKey } from 'src/common/types/entitlement.types';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import { EntitlementResolverService } from '../entitlements/services/entitlement-resolver.service';

/**
 * Entitlements Mock Controller - Test Cases for Phase 1+2
 *
 * This controller demonstrates all entitlement check patterns.
 * Use this to test the entitlement system before implementing usage tracking.
 *
 * Test Scenarios:
 * 1. Boolean features (redlining_enabled, custom_playbooks)
 * 2. Tiered text features (template_library, bilingual_quality)
 * 3. Quota features (documents_per_month, contract_reviews_per_month)
 * 4. Capacity features (user_seats)
 * 5. Add-on merging (tenant with add-ons)
 * 6. Admin overrides (tenant with overrides)
 *
 * Test Tenants (from seed 008):
 * - Tenant 1 (general_counsel): Full features, no add-ons
 * - Tenant 2 (shield): Basic features, HAS add-on (+50 documents)
 * - Tenant 3 (infrastructure): Unlimited, HAS override (custom documents_per_month)
 */
@Controller('mock/entitlements')
@AuthOptions({ tenant: true })
@ApiTags('mock-entitlements')
export class EntitlementsMockController {
  constructor(private readonly resolver: EntitlementResolverService) {}

  // ============================================
  // USE CASE 1: Boolean Feature - Must Be True
  // ============================================
  // Requires: redlining_enabled = true
  // Passes: general_counsel, infrastructure (have redlining)
  // Fails: navigator, shield (redlining disabled)
  @Post('redlining/analyze')
  @UseGuards(EntitlementGuard)
  @RequireEntitlement('redlining_enabled')
  @ApiOperation({ summary: 'Test redlining feature (boolean)' })
  @ApiResponse({ status: 200, description: 'Redlining enabled' })
  @ApiResponse({ status: 403, description: 'Redlining not enabled on plan' })
  testRedlining(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Redlining accessed by ${user.email}`,
      feature: 'redlining_enabled',
      status: 'enabled',
    };
  }

  // ============================================
  // USE CASE 2: Tiered Text Feature - Must Match Value
  // ============================================
  // Requires: template_library = 'full'
  // Passes: general_counsel, infrastructure (have 'full')
  // Fails: navigator, shield (have 'essential')
  @Get('templates/premium')
  @UseGuards(EntitlementGuard)
  @RequireEntitlement({ featureKey: 'template_library', value_text: 'full' })
  @ApiOperation({ summary: 'Test template library tier (text)' })
  @ApiResponse({ status: 200, description: 'Full template library access' })
  @ApiResponse({
    status: 403,
    description: 'Only essential templates available',
  })
  testFullTemplateLibrary(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Premium templates accessed by ${user.email}`,
      feature: 'template_library',
      tier: 'full',
    };
  }

  // ============================================
  // USE CASE 3: Tiered Text Feature - Jais Native
  // ============================================
  // Requires: bilingual_quality = 'jais_native'
  // Passes: general_counsel, infrastructure
  // Fails: navigator, shield (have 'standard')
  @Post('documents/jais-native')
  @UseGuards(EntitlementGuard)
  @RequireEntitlement({
    featureKey: 'bilingual_quality',
    value_text: 'jais_native',
  })
  @ApiOperation({ summary: 'Test Jais-native Arabic (text)' })
  @ApiResponse({ status: 200, description: 'Jais-native quality enabled' })
  @ApiResponse({ status: 403, description: 'Only standard quality available' })
  testJaisNative(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Jais-native generation by ${user.email}`,
      feature: 'bilingual_quality',
      quality: 'jais_native',
    };
  }

  // ============================================
  // USE CASE 4: Quota Feature - Minimum Value Check
  // ============================================
  // Requires: documents_per_month >= 50
  // Passes: general_counsel (100), infrastructure (unlimited), shield WITH addon (25+50=75)
  // Fails: navigator (3), shield WITHOUT addon (25)
  @Post('documents/bulk-generate')
  @UseGuards(EntitlementGuard)
  @RequireEntitlement({ featureKey: 'documents_per_month', minValue: 50 })
  @ApiOperation({ summary: 'Test document quota minimum (quota)' })
  @ApiResponse({ status: 200, description: 'Sufficient document quota' })
  @ApiResponse({ status: 403, description: 'Insufficient document quota' })
  testDocumentQuotaMin(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Bulk generation by ${user.email}`,
      feature: 'documents_per_month',
      minimumRequired: 50,
    };
  }

  // ============================================
  // USE CASE 5: Capacity Feature - Minimum Seats
  // ============================================
  // Requires: user_seats >= 5
  // Passes: general_counsel (10), infrastructure (unlimited)
  // Fails: navigator (1), shield (3)
  @Post('team/bulk-invite')
  @UseGuards(EntitlementGuard)
  @RequireEntitlement({ featureKey: 'user_seats', minValue: 5 })
  @ApiOperation({ summary: 'Test user seats capacity (capacity)' })
  @ApiResponse({ status: 200, description: 'Sufficient seats' })
  @ApiResponse({ status: 403, description: 'Insufficient seats' })
  testUserSeatsCapacity(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Bulk invite by ${user.email}`,
      feature: 'user_seats',
      minimumRequired: 5,
    };
  }

  // ============================================
  // USE CASE 6: Multiple Boolean Features (AND Logic)
  // ============================================
  // Requires: redlining_enabled AND localizer_check
  // Passes: general_counsel, infrastructure (both have both)
  // Fails: navigator, shield (missing both)
  @Post('contracts/advanced-analysis')
  @UseGuards(EntitlementGuard)
  @RequireEntitlement('redlining_enabled', 'localizer_check')
  @ApiOperation({ summary: 'Test multiple boolean features (AND)' })
  @ApiResponse({ status: 200, description: 'All features enabled' })
  @ApiResponse({ status: 403, description: 'Missing required features' })
  testMultipleBooleans(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Advanced analysis by ${user.email}`,
      features: ['redlining_enabled', 'localizer_check'],
      status: 'all_enabled',
    };
  }

  // ============================================
  // USE CASE 7: Infrastructure-Only Feature
  // ============================================
  // Requires: custom_playbooks = true
  // Passes: infrastructure only
  // Fails: navigator, shield, general_counsel
  @Post('playbooks/upload')
  @UseGuards(EntitlementGuard)
  @RequireEntitlement('custom_playbooks')
  @ApiOperation({ summary: 'Test infrastructure-only feature' })
  @ApiResponse({ status: 200, description: 'Custom playbooks enabled' })
  @ApiResponse({ status: 403, description: 'Upgrade to Infrastructure plan' })
  testCustomPlaybooks(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Custom playbook upload by ${user.email}`,
      feature: 'custom_playbooks',
      plan: 'infrastructure',
    };
  }

  // ============================================
  // USE CASE 8: Debug - Show All Resolved Entitlements
  // ============================================
  // No guard - just returns resolved entitlements for debugging
  @Get('debug/resolved')
  @ApiOperation({ summary: 'Debug: Show all resolved entitlements' })
  @ApiResponse({
    status: 200,
    description: 'All entitlements for current tenant',
  })
  async debugResolvedEntitlements(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    const { entitlements, plan } = await this.resolver.resolveAllForTenant(
      user.tenantId,
    );

    return {
      tenantId: user.tenantId,
      role: user.role,
      entitlements,
      plan,
    };
  }

  // ============================================
  // USE CASE 9: Debug - Show Specific Feature Resolution
  // ============================================
  // No guard - just returns specific feature entitlement
  @Get('debug/feature/:featureKey')
  @ApiOperation({ summary: 'Debug: Show specific feature entitlement' })
  @ApiResponse({ status: 200, description: 'Feature entitlement details' })
  async debugFeatureEntitlement(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('featureKey') featureKey: FeatureKey,
  ) {
    const entitlement = await this.resolver.resolveForTenant(
      user.tenantId,
      featureKey,
    );

    return {
      tenantId: user.tenantId,
      featureKey,
      entitlement,
    };
  }
}
