import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SystemTenantRole } from 'src/common/types';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import {
  ChangePlanDto,
  PendingPlanChangeResponseDto,
  SchedulePlanChangeResponseDto,
  SubscriptionResponseDto,
} from './dto';
import { StripeSubscriptionService } from '../stripe/services/stripe-subscription.service';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Subscriptions Controller - Phase 6
 *
 * Manages tenant subscriptions: view current, change plan, cancel, and renew.
 *
 * Endpoints:
 * - GET /subscriptions/current - View current subscription
 * - POST /subscriptions/change-plan - Change plan (requires billing:manage permission)
 * - POST /subscriptions/cancel - Cancel subscription (requires billing:manage permission)
 * - POST /subscriptions/renew - Force renew current period (tenant_admin only, for testing)
 *
 * Authorization:
 * - All endpoints require tenant token (@AuthOptions({ tenant: true }))
 * - Plan changes and cancellations require billing:manage permission
 * - Manual renewal requires tenant_admin role (debug/testing only)
 */
@Controller('subscriptions')
@AuthOptions({ tenant: true })
@ApiTags('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripeSubscriptionService: StripeSubscriptionService,
  ) {}

  /**
   * Get current subscription with plan details
   *
   * Returns the active subscription for the authenticated tenant, including:
   * - Subscription status and dates
   * - Current billing period
   * - Associated plan details
   */
  @Get('current')
  @ApiOperation({
    summary: 'Get current subscription',
    description:
      'Returns the active subscription for the authenticated tenant with plan details',
  })
  @ApiResponse({
    status: 200,
    description: 'Current subscription',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'No active subscription found',
  })
  async getCurrentSubscription(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    const subscription = await this.subscriptionsService.getCurrentSubscription(
      user.tenantId,
    );

    return SubscriptionResponseDto.fromEntity(subscription, subscription.plan);
  }

  /**
   * Change plan (upgrade or downgrade)
   *
   * Changes the tenant's subscription plan. This operation:
   * - Updates the plan_id on the subscription
   * - Invalidates the entitlement snapshot (new entitlements take effect immediately)
   * - Emits a domain event for audit trail
   *
   * Requires: billing:manage permission (typically tenant_admin or billing manager)
   */
  @Post('change-plan')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({
    summary: 'Change subscription plan',
    description:
      'Change the tenant subscription plan (upgrade or downgrade). Requires billing:manage permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Plan changed successfully',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Already on this plan or invalid plan',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing billing:manage permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Plan not found',
  })
  async changePlan(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body() dto: ChangePlanDto,
  ) {
    const updatedSubscription = await this.subscriptionsService.changePlan(
      user.tenantId,
      dto.planKey,
      user.userId,
    );

    return SubscriptionResponseDto.fromEntity(updatedSubscription);
  }

  /**
   * Cancel subscription
   *
   * Cancels the tenant's subscription. This operation:
   * - Sets status to 'cancelled'
   * - Records cancellation timestamp
   * - Emits a domain event for audit trail
   *
   * Note: Cancellation takes effect immediately. In a production system, you might
   * want to allow access until the end of the current billing period.
   *
   * Requires: billing:manage permission (typically tenant_admin or billing manager)
   */
  @Post('cancel')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({
    summary: 'Cancel subscription',
    description:
      'Cancel the tenant subscription. Requires billing:manage permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription cancelled',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Missing billing:manage permission',
  })
  @ApiResponse({
    status: 404,
    description: 'No active subscription found',
  })
  async cancelSubscription(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const cancelledSubscription = await this.subscriptionsService.cancel(
      user.tenantId,
      user.userId,
    );

    return SubscriptionResponseDto.fromEntity(cancelledSubscription);
  }

  /**
   * Force renew current billing period (admin/debug only)
   *
   * Advances the current billing period to the next month. This is primarily
   * for testing and debugging. In production, this would be called by a scheduled
   * cron job (BullMQ) that runs daily to renew all due subscriptions.
   *
   * Requires: tenant_admin role
   */
  @Post('renew')
  @UseGuards(RolesGuard)
  @Roles(SystemTenantRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Force renew billing period (admin/debug)',
    description:
      'Advances the current billing period to the next month. Requires tenant_admin role. For testing only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Billing period renewed',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Missing tenant_admin role',
  })
  @ApiResponse({
    status: 404,
    description: 'No active subscription found',
  })
  async renewPeriod(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const renewedSubscription = await this.subscriptionsService.renewPeriod(
      user.tenantId,
    );

    return SubscriptionResponseDto.fromEntity(renewedSubscription);
  }

  /**
   * Schedule a plan change to take effect at the end of the current billing period.
   *
   * Uses Stripe Subscription Schedules so the current plan remains active until
   * the billing period ends. The new plan activates automatically at period end.
   *
   * Requires: billing:manage permission and an active Stripe subscription.
   */
  @Post('plan/change')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({
    summary: 'Schedule a plan change at period end',
    description:
      'Schedules an upgrade or downgrade to take effect at the end of the current billing period. ' +
      'Uses Stripe Subscription Schedules. Requires billing:manage permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Plan change scheduled',
    type: SchedulePlanChangeResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'No active Stripe subscription, already on this plan, or plan has no Stripe price',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing billing:manage permission',
  })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async schedulePlanChange(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body() dto: ChangePlanDto,
  ): Promise<SchedulePlanChangeResponseDto> {
    return this.stripeSubscriptionService.schedulePlanChange(
      user.tenantId,
      dto.planKey,
      user.userId,
    );
  }

  /**
   * Cancel a pending scheduled plan change.
   *
   * Releases the Stripe Subscription Schedule so the current plan continues
   * beyond the period end without changing.
   *
   * Requires: billing:manage permission.
   */
  @Post('plan/cancel-change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({
    summary: 'Cancel a pending plan change',
    description:
      'Cancels a scheduled plan change so the subscription continues on the current plan. ' +
      'Requires billing:manage permission.',
  })
  @ApiResponse({ status: 204, description: 'Pending plan change cancelled' })
  @ApiResponse({
    status: 400,
    description: 'No pending plan change to cancel',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing billing:manage permission',
  })
  async cancelScheduledPlanChange(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<void> {
    await this.stripeSubscriptionService.cancelScheduledPlanChange(
      user.tenantId,
    );
  }

  /**
   * Get info about any pending scheduled plan change.
   */
  @Get('plan/pending-change')
  @ApiOperation({
    summary: 'Get pending plan change',
    description:
      'Returns info about any scheduled plan change for the tenant. ' +
      'Returns { hasPendingChange: false } when none exists.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pending plan change info',
    type: PendingPlanChangeResponseDto,
  })
  async getPendingPlanChange(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<PendingPlanChangeResponseDto> {
    return this.stripeSubscriptionService.getPendingPlanChange(user.tenantId);
  }
}
