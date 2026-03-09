import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CREDIT_PACKAGES, CREDIT_PACKAGE_CURRENCY } from 'src/common/constants/credit-packages.constant';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TENANT_PERMISSIONS } from 'src/common/constants/tenant-permissions.constant';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../../auth/strategies/jwt-payload.interface';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import {
  ChangePlanDto,
  PendingPlanChangeResponseDto,
  SchedulePlanChangeResponseDto,
  SubscriptionResponseDto,
} from '../../subscriptions/dto';
import { BillingStatusResponseDto } from '../dto/billing-status-response.dto';
import { CancelSubscriptionResponseDto } from '../dto/cancel-subscription.dto';
import {
  CheckoutSessionResponseDto,
  CreateCheckoutSessionDto,
} from '../dto/create-checkout-session.dto';
import {
  CreditPackageCatalogItemDto,
  CreateCreditCheckoutDto,
} from '../dto/create-credit-checkout.dto';
import {
  CreatePortalSessionDto,
  PortalSessionResponseDto,
} from '../dto/create-portal-session.dto';
import { StripeBillingPortalService } from '../services/stripe-billing-portal.service';
import { StripeCheckoutService } from '../services/stripe-checkout.service';
import { StripeSubscriptionService } from '../services/stripe-subscription.service';

/**
 * Billing Controller
 *
 * Single entry point for all tenant billing operations.
 *
 * All endpoints require a tenant token. Mutation endpoints additionally
 * require the `billing:manage` permission.
 *
 * Routes:
 *   GET  /billing/subscription          — Current subscription
 *   GET  /billing/status                — Full billing status (subscription + dunning + pending change)
 *   GET  /billing/plan/pending-change   — Pending Stripe schedule info
 *   POST /billing/plan/change           — Schedule plan change at period end
 *   POST /billing/plan/cancel-change    — Cancel scheduled plan change
 *   POST /billing/subscription/cancel   — Schedule end-of-period cancellation
 *   POST /billing/subscription/reactivate — Undo pending cancellation
 *   POST /billing/checkout/subscription — Create Stripe Checkout session
 *   POST /billing/portal/session        — Create Stripe Customer Portal session
 *   GET  /billing/credits/packages      — List available credit packages
 *   POST /billing/checkout/credits      — Create Stripe Checkout for credit purchase
 */
@ApiTags('billing')
@Controller('billing')
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@SwaggerCookieAuth.tenantAccessToken()
export class BillingController {
  constructor(
    private readonly stripeCheckoutService: StripeCheckoutService,
    private readonly stripeBillingPortalService: StripeBillingPortalService,
    private readonly stripeSubscriptionService: StripeSubscriptionService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  // ============================================================
  // Read-only subscription endpoints
  // ============================================================

  @Get('subscription')
  @ApiOperation({
    summary: 'Get current subscription',
    description:
      'Returns the active or past_due subscription for the authenticated tenant, including plan details.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current subscription',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'No subscription found' })
  async getSubscription(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionsService.getCurrentSubscription(
      user.tenantId,
    );
    return SubscriptionResponseDto.fromEntity(subscription, subscription.plan);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get full billing status',
    description:
      'Returns the current subscription plus dunning state (when past_due) and any pending plan change. ' +
      'Use this as the single source of truth for rendering the billing settings page.',
  })
  @ApiResponse({
    status: 200,
    description: 'Billing status',
    type: BillingStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'No subscription found' })
  async getBillingStatus(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<BillingStatusResponseDto> {
    const subscription = await this.subscriptionsService.getCurrentSubscription(
      user.tenantId,
    );

    const subscriptionDto = SubscriptionResponseDto.fromEntity(
      subscription,
      subscription.plan,
    );

    const cancel_at_period_end =
      subscription.metadata?.cancel_at_period_end === true;

    const result: BillingStatusResponseDto = {
      subscription: subscriptionDto,
      cancel_at_period_end,
    };

    // Pending plan change — Stripe schedule lookup (no-op for Navigator tenants)
    const pendingChange =
      await this.stripeSubscriptionService.getPendingPlanChange(user.tenantId);

    if (pendingChange.hasPendingChange) {
      result.pending_plan_change = {
        new_plan_key: pendingChange.newPlanKey,
        scheduled_for: pendingChange.scheduledFor,
      };
    }

    // Dunning info is only relevant when the subscription is past_due
    if (subscription.status === 'past_due') {
      const meta = subscription.metadata ?? {};
      result.dunning = {};

      if (meta.last_payment_failure) {
        const failure = meta.last_payment_failure as Record<string, unknown>;
        result.dunning.last_payment_failure = {
          invoice_id: failure.invoice_id as string,
          amount: failure.amount as number,
          attempt_count: failure.attempt_count as number,
          next_attempt: failure.next_attempt
            ? new Date(failure.next_attempt as string)
            : null,
          failed_at: new Date(failure.failed_at as string),
        };
      }

      if (meta.payment_action_required) {
        const action = meta.payment_action_required as Record<string, unknown>;
        result.dunning.payment_action_required = {
          invoice_url: action.invoice_url as string,
          amount: action.amount as number,
        };
      }
    }

    return result;
  }

  // ============================================================
  // Plan change endpoints
  // ============================================================

  @Post('plan/change')
  @HttpCode(HttpStatus.OK)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.BILLING.MANAGE)
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
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
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

  @Post('plan/cancel-change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.BILLING.MANAGE)
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
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async cancelScheduledPlanChange(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<void> {
    await this.stripeSubscriptionService.cancelScheduledPlanChange(
      user.tenantId,
    );
  }

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
    return this.stripeSubscriptionService.getPendingPlanChange(
      user.tenantId,
    ) as Promise<PendingPlanChangeResponseDto>;
  }

  // ============================================================
  // Subscription cancel / reactivate
  // ============================================================

  @Post('subscription/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.BILLING.MANAGE)
  @ApiOperation({
    summary: 'Cancel subscription at end of current billing period',
    description:
      'Schedules the Stripe subscription to cancel when the current period ends. ' +
      'The tenant retains full access until that date. ' +
      'Use POST /billing/subscription/reactivate to undo before the period ends.',
  })
  @ApiResponse({
    status: 200,
    description: 'Cancellation scheduled — returns the date access will end',
    type: CancelSubscriptionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'No active Stripe subscription to cancel',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async cancelSubscription(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<CancelSubscriptionResponseDto> {
    return this.stripeSubscriptionService.cancelSubscription(
      user.tenantId,
      user.userId,
    );
  }

  @Post('subscription/reactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.BILLING.MANAGE)
  @ApiOperation({
    summary: 'Undo a pending end-of-period subscription cancellation',
    description:
      'Removes the cancel_at_period_end flag from Stripe and clears the pending cancellation. ' +
      'Only valid while the subscription is still active (before the period end date).',
  })
  @ApiResponse({
    status: 204,
    description: 'Cancellation revoked — subscription continues unchanged',
  })
  @ApiResponse({
    status: 400,
    description: 'No active subscription or no pending cancellation',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async reactivateSubscription(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<void> {
    return this.stripeSubscriptionService.reactivateSubscription(
      user.tenantId,
      user.userId,
    );
  }

  // ============================================================
  // Checkout + portal
  // ============================================================

  @Post('checkout/subscription')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.BILLING.MANAGE)
  @ApiOperation({
    summary: 'Create a Stripe Checkout Session for a subscription plan',
    description:
      'Generates a Stripe-hosted Checkout URL. Redirect the user to checkoutUrl to complete payment. ' +
      'On success Stripe fires a checkout.session.completed webhook which activates the subscription.',
  })
  @ApiResponse({
    status: 201,
    description: 'Checkout session created — redirect user to checkoutUrl',
    type: CheckoutSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Plan has no Stripe price configured',
  })
  @ApiResponse({
    status: 409,
    description:
      'Tenant already has an active Stripe subscription — use the plan change flow',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async createCheckoutSession(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body() dto: CreateCheckoutSessionDto,
  ): Promise<CheckoutSessionResponseDto> {
    return this.stripeCheckoutService.createCheckoutSession(user.tenantId, dto);
  }

  @Post('portal/session')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.BILLING.MANAGE)
  @ApiOperation({
    summary: 'Create a Stripe Customer Portal session',
    description:
      'Generates a Stripe-hosted Customer Portal URL. Redirect the user to url to manage their billing: ' +
      'update payment method, view invoices, cancel or change subscription plan.',
  })
  @ApiResponse({
    status: 201,
    description: 'Portal session created — redirect user to url',
    type: PortalSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to resolve Stripe customer for tenant',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createPortalSession(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body() dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResponseDto> {
    return this.stripeBillingPortalService.createPortalSession(
      user.tenantId,
      dto,
    );
  }

  // ============================================================
  // Credits
  // ============================================================

  @Get('credits/packages')
  @ApiOperation({
    summary: 'List available credit packages',
    description:
      'Returns all available one-time credit packages with their prices. ' +
      'Use the packageKey from this response when creating a credit checkout session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Available credit packages',
    type: [CreditPackageCatalogItemDto],
  })
  listCreditPackages(): CreditPackageCatalogItemDto[] {
    return CREDIT_PACKAGES.map((pkg) => ({
      key: pkg.key,
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price,
      currency: CREDIT_PACKAGE_CURRENCY,
    }));
  }

  @Post('checkout/credits')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.BILLING.MANAGE)
  @ApiOperation({
    summary: 'Create a Stripe Checkout Session for a credit purchase',
    description:
      'Generates a Stripe-hosted Checkout URL for a one-time credit purchase. ' +
      'Redirect the user to checkoutUrl to complete payment. ' +
      'On success Stripe fires a checkout.session.completed webhook which adds credits to the tenant ledger.',
  })
  @ApiResponse({
    status: 201,
    description: 'Checkout session created — redirect user to checkoutUrl',
    type: CheckoutSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Credit package has no Stripe price configured',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Credit package not found' })
  async createCreditCheckout(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body() dto: CreateCreditCheckoutDto,
  ): Promise<CheckoutSessionResponseDto> {
    return this.stripeCheckoutService.createCreditPurchaseCheckout(
      user.tenantId,
      dto,
    );
  }
}
