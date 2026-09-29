import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CreatePortalSessionDto,
  PortalSessionResponseDto,
} from '../dto/create-portal-session.dto';
import { ConfigService } from '@nestjs/config';
import {
  allowedRedirectOrigins,
  assertAllowedRedirect,
} from '../redirect-allowlist';
import { StripeCustomerService } from './stripe-customer.service';
import { StripePortalConfigurationService } from './stripe-portal-configuration.service';
import { I18nService } from 'nestjs-i18n';
import { BillingI18n } from '../constants/i18n.constants';
import { StripeService } from '../stripe.service';

@Injectable()
export class StripeBillingPortalService {
  private readonly logger = new Logger(StripeBillingPortalService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly stripeCustomerService: StripeCustomerService,
    private readonly configService: ConfigService,
    private readonly portalConfiguration: StripePortalConfigurationService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Create a Stripe Customer Portal session for a tenant.
   *
   * The portal is fully hosted by Stripe and lets the tenant:
   * - Update payment method
   * - View and download past invoices
   * - Cancel subscription (at period end)
   * - Switch plan or billing interval
   *
   * The portal's configuration (catalog prices only, cancel at period end) is kept in code by
   * StripePortalConfigurationService, never the Dashboard default.
   */
  async createPortalSession(
    tenantId: string,
    dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResponseDto> {
    assertAllowedRedirect(
      dto.returnUrl,
      allowedRedirectOrigins(this.configService),
    );
    const customerId =
      await this.stripeCustomerService.getOrCreateCustomer(tenantId);

    if (!customerId) {
      throw new BadRequestException(
        this.i18n.t(BillingI18n.errors.CUSTOMER_UNAVAILABLE),
      );
    }

    const session =
      await this.stripeService.client.billingPortal.sessions.create({
        customer: customerId,
        return_url: dto.returnUrl,
        configuration: await this.portalConfiguration.getId(),
      });

    this.logger.log(
      `Created Stripe Customer Portal session for tenant ${tenantId}`,
    );

    return { url: session.url };
  }
}
