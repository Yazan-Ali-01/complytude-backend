import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SystemTenantRole } from 'src/common/types';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import { SubscriptionResponseDto } from './dto';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Subscriptions Controller
 *
 * Manages tenant subscriptions: view current and renew.
 *
 * Endpoints:
 * - GET /subscriptions/current - View current subscription
 * - POST /subscriptions/renew - Force renew current period (tenant_admin only, for testing)
 *
 * Note: Plan changes and cancellations use /billing/* endpoints (StripeSubscriptionService).
 *
 * Authorization:
 * - All endpoints require tenant token (@AuthOptions({ tenant: true }))
 * - Manual renewal requires tenant_admin role (debug/testing only)
 */
@Controller('subscriptions')
@AuthOptions({ tenant: true })
@ApiTags('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

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
}
