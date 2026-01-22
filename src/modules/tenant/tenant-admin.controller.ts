import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { SystemAdminGuard } from '../../common/guards/system-admin.guard';
import { FeaturesService } from './features.service';
import {
  AddCreditsDto,
  GrantOverrideDto,
  RevokeOverrideDto,
  FeatureOverrideResponseDto,
} from './dto/feature-override.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ActiveOverride, EffectiveFeaturesResponse } from './entities/tenant.entity';
import { USAGE_TRACKED_FEATURES } from '../../config/plan-features.config';

/**
 * System Administrator endpoints for tenant management
 * All endpoints require system admin privileges
 */
@ApiTags('System Admin - Tenants')
@Controller('admin/tenants')
@UseGuards(SystemAdminGuard)
@ApiBearerAuth()
export class TenantAdminController {
  private readonly logger = new Logger(TenantAdminController.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly featuresService: FeaturesService,
  ) {}

  // ============================================================================
  // SYSTEM ADMIN ENDPOINTS (Platform-wide management)
  // ============================================================================

  @Get()
  @ApiOperation({
    summary: '[ADMIN] List all tenants',
    description:
      'Retrieves a list of all tenants in the system. System admin only.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all tenants',
    type: [Object],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getAllTenants(): Promise<Tenant[]> {
    this.logger.log('[ADMIN] Fetching all tenants');
    return this.tenantService.findAll();
  }

  @Get(':tenantId')
  @ApiOperation({
    summary: '[ADMIN] Get tenant by ID',
    description:
      'Retrieves detailed information about any tenant. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant details',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getTenantById(@Param('tenantId') tenantId: string): Promise<Tenant> {
    this.logger.log(`[ADMIN] Fetching tenant: ${tenantId}`);
    return this.tenantService.findById(tenantId);
  }

  @Get('email/:email')
  @ApiOperation({
    summary: '[ADMIN] Get tenant by email',
    description:
      'Retrieves tenant information by email address. System admin only.',
  })
  @ApiParam({ name: 'email', description: 'Tenant email' })
  @ApiResponse({
    status: 200,
    description: 'Tenant details',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getTenantByEmail(@Param('email') email: string): Promise<Tenant> {
    this.logger.log(`[ADMIN] Fetching tenant by email: ${email}`);
    return this.tenantService.findByEmail(email);
  }

  @Put(':tenantId')
  @ApiOperation({
    summary: '[ADMIN] Update any tenant',
    description:
      'Updates any tenant including plan and features. System admin only. Use this to grant custom features or change plans.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant updated successfully',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async updateTenant(
    @Param('tenantId') tenantId: string,
    @Body() updateTenantDto: UpdateTenantDto,
  ): Promise<Tenant> {
    this.logger.log(`[ADMIN] Updating tenant: ${tenantId}`);
    return this.tenantService.updateTenant(tenantId, updateTenantDto);
  }

  @Delete(':tenantId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Delete any tenant',
    description:
      'Deletes any tenant and all associated data including the database schema. ⚠️ This action is irreversible. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async deleteTenant(
    @Param('tenantId') tenantId: string,
  ): Promise<{ message: string; tenantId: string }> {
    this.logger.warn(`[ADMIN] Deleting tenant: ${tenantId}`);
    await this.tenantService.deleteTenant(tenantId);
    return {
      message: 'Tenant deleted successfully',
      tenantId,
    };
  }

  @Get(':tenantId/schema')
  @ApiOperation({
    summary: '[ADMIN] Get any tenant schema',
    description: 'Retrieves schema details for any tenant. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant schema information',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Schema not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getTenantSchema(@Param('tenantId') tenantId: string) {
    this.logger.log(`[ADMIN] Fetching schema for tenant: ${tenantId}`);
    return this.tenantService.getTenantSchema(tenantId);
  }

  // ============================================================================
  // CREDITS MANAGEMENT (Stripe-ready)
  // ============================================================================

  @Get(':tenantId/credits')
  @ApiOperation({
    summary: '[ADMIN] Get tenant credit balances',
    description:
      'Retrieves all credit balances for a tenant. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Credit balances',
    type: Object,
  })
  async getTenantCredits(@Param('tenantId') tenantId: string) {
    this.logger.log(`[ADMIN] Fetching credits for tenant: ${tenantId}`);
    return this.featuresService.getAllCreditsBalances(tenantId);
  }

  @Get(':tenantId/credits/:featureKey')
  @ApiOperation({
    summary: '[ADMIN] Get tenant credit balance for feature',
    description:
      'Retrieves credit balance for a specific feature. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiParam({ name: 'featureKey', description: 'Feature key' })
  @ApiResponse({
    status: 200,
    description: 'Credit balance',
    type: Object,
  })
  async getTenantCreditBalance(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
  ) {
    this.logger.log(`[ADMIN] Fetching credit balance for tenant ${tenantId}, feature ${featureKey}`);
    const balance = await this.featuresService.getCreditsBalance(tenantId, featureKey);
    return { tenant_id: tenantId, feature_key: featureKey, credits_remaining: balance };
  }

  @Post(':tenantId/credits')
  @ApiOperation({
    summary: '[ADMIN] Add credits to tenant',
    description:
      'Adds purchased credits to a tenant. System admin only. Use for manual credit grants or Stripe webhook calls.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Credits added successfully',
    type: Object,
  })
  async addTenantCredits(
    @Param('tenantId') tenantId: string,
    @Body() dto: AddCreditsDto,
  ) {
    this.logger.log(`[ADMIN] Adding credits to tenant: ${tenantId}, feature: ${dto.feature_key}, amount: ${dto.credits}`);
    return this.featuresService.addCredits(tenantId, dto.feature_key, dto.credits, 'admin');
  }

  @Get(':tenantId/credits/history')
  @ApiOperation({
    summary: '[ADMIN] Get tenant credit purchase history',
    description:
      'Retrieves credit purchase history for a tenant. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Credit purchase history',
    type: [Object],
  })
  async getTenantCreditHistory(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey?: string,
  ) {
    this.logger.log(`[ADMIN] Fetching credit history for tenant: ${tenantId}`);
    return this.featuresService.getCreditHistory(tenantId, featureKey);
  }

  @Post('webhooks/stripe')
  @ApiOperation({
    summary: '[ADMIN] Stripe webhook handler',
    description:
      'Webhook endpoint for Stripe payment events. System admin only. Currently stubbed for future integration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed',
  })
  async handleStripeWebhook(@Body() payload: any) {
    this.logger.log(`[ADMIN] Stripe webhook received: ${JSON.stringify(payload)}`);
    return { message: 'Webhook received (stub - not yet implemented)' };
  }

  // ============================================================================
  // OVERRIDE MANAGEMENT (Feature Overrides with Audit Trail)
  // ============================================================================

  @Post('overrides')
  @ApiOperation({
    summary: '[ADMIN] Grant feature override',
    description:
      'Grants a feature override to a tenant with audit trail. Valid for time-limited trials or permanent customizations.',
  })
  @ApiResponse({
    status: 201,
    description: 'Override granted successfully',
    type: FeatureOverrideResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid feature key or data' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async grantOverride(
    @Body() dto: GrantOverrideDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FeatureOverrideResponseDto> {
    this.logger.log(
      `[ADMIN] Granting override: ${dto.feature_key} for tenant ${dto.tenant_id} by ${user.userId}`,
    );
    return this.featuresService.grantOverride(
      dto.tenant_id,
      dto.feature_key,
      dto.override_value,
      dto.reason,
      user.userId,
      dto.expires_at,
    );
  }

  @Delete('overrides')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Revoke feature override',
    description:
      'Revokes an active feature override for a tenant. Soft delete with audit trail.',
  })
  @ApiResponse({
    status: 200,
    description: 'Override revoked successfully',
    type: FeatureOverrideResponseDto,
  })
  @ApiResponse({ status: 404, description: 'No active override found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async revokeOverride(
    @Body() dto: RevokeOverrideDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FeatureOverrideResponseDto> {
    this.logger.log(
      `[ADMIN] Revoking override: ${dto.feature_key} for tenant ${dto.tenant_id} by ${user.userId}`,
    );
    return this.featuresService.revokeOverride(
      dto.tenant_id,
      dto.feature_key,
      dto.reason,
      user.userId,
    );
  }

  @Get(':tenantId/overrides')
  @ApiOperation({
    summary: '[ADMIN] Get tenant active overrides',
    description:
      'Retrieves all active (non-expired, non-revoked) feature overrides for a tenant. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Active overrides',
    type: [Object],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getTenantOverrides(
    @Param('tenantId') tenantId: string,
  ): Promise<ActiveOverride[]> {
    this.logger.log(`[ADMIN] Fetching overrides for tenant: ${tenantId}`);
    return this.featuresService.getActiveOverrides(tenantId);
  }

  @Get(':tenantId/effective-features')
  @ApiOperation({
    summary: '[ADMIN] Get tenant effective features',
    description:
      'Retrieves the merged view of tenant features (plan defaults + active overrides) with usage summary. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Effective features with sources',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getEffectiveFeatures(
    @Param('tenantId') tenantId: string,
  ): Promise<EffectiveFeaturesResponse> {
    this.logger.log(
      `[ADMIN] Fetching effective features for tenant: ${tenantId}`,
    );

    const features = await this.featuresService.getTenantFeatures(tenantId);
    const overrides = await this.featuresService.getActiveOverrides(tenantId);

    // Get tenant plan
    const tenant = await this.tenantService.findById(tenantId);

    // Build usage summary for all metered features
    const usageSummary: Record<string, any> = {};
    for (const featureKey of USAGE_TRACKED_FEATURES) {
      usageSummary[featureKey] =
        await this.featuresService.checkUsageLimit(tenantId, featureKey);
    }

    // Build feature sources
    const featureSources = overrides.map((override) => ({
      key: override.feature_key,
      value: override.override_value,
      source: 'db_override' as const,
      expires_at: override.expires_at,
    }));

    return {
      tenant_id: tenantId,
      plan: tenant.plan,
      features,
      feature_sources: featureSources,
      usage_summary: usageSummary,
    };
  }

  @Get(':tenantId/usage')
  @ApiOperation({
    summary: '[ADMIN] Get tenant usage summary',
    description:
      'Retrieves current usage summary for all metered features. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Usage summary',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getTenantUsage(@Param('tenantId') tenantId: string) {
    this.logger.log(`[ADMIN] Fetching usage summary for tenant: ${tenantId}`);

    const tenant = await this.tenantService.findById(tenantId);
    const usageSummary: Record<string, any> = {};

    for (const featureKey of USAGE_TRACKED_FEATURES) {
      usageSummary[featureKey] =
        await this.featuresService.checkUsageLimit(tenantId, featureKey);
    }

    return {
      tenant_id: tenantId,
      plan: tenant.plan,
      usage: usageSummary,
    };
  }
}
