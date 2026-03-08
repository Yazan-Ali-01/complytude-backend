import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TENANT_PERMISSIONS } from 'src/common/constants/tenant-permissions.constant';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../../auth/strategies/jwt-payload.interface';
import {
  CheckoutSessionResponseDto,
  CreateCheckoutSessionDto,
} from '../dto/create-checkout-session.dto';
import {
  CreatePortalSessionDto,
  PortalSessionResponseDto,
} from '../dto/create-portal-session.dto';
import { StripeBillingPortalService } from '../services/stripe-billing-portal.service';
import { StripeCheckoutService } from '../services/stripe-checkout.service';

@ApiTags('billing')
@Controller('tenants/billing')
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@SwaggerCookieAuth.tenantAccessToken()
export class StripeCheckoutController {
  constructor(
    private readonly stripeCheckoutService: StripeCheckoutService,
    private readonly stripeBillingPortalService: StripeBillingPortalService,
  ) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.BILLING.MANAGE)
  @ApiOperation({
    summary: 'Create a Stripe Checkout Session for a subscription plan',
    description:
      'Generates a Stripe-hosted Checkout URL. Redirect the user to `checkoutUrl` to complete payment. ' +
      'On success Stripe fires a `checkout.session.completed` webhook which activates the subscription.',
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
      'Generates a Stripe-hosted Customer Portal URL. Redirect the user to `url` to manage their billing: ' +
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
}
