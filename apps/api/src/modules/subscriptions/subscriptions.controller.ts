import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import { SubscriptionResponseDto } from './dto';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Subscriptions Controller
 *
 * Read-only: GET /subscriptions/current (tenant token).
 *
 * Plan changes and cancellations go through the /billing/* endpoints (Stripe) and its webhooks.
 * There are deliberately no local change-plan, cancel or renew routes: they rewrote
 * tenant_subscriptions without Stripe (a free upgrade, or a "cancel" that kept charging the card).
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
}
