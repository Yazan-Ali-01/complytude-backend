import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CreatePortalSessionDto,
  PortalSessionResponseDto,
} from '../dto/create-portal-session.dto';
import { StripeCustomerService } from './stripe-customer.service';
import { StripeService } from '../stripe.service';

@Injectable()
export class StripeBillingPortalService {
  private readonly logger = new Logger(StripeBillingPortalService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly stripeCustomerService: StripeCustomerService,
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
   * Portal configuration (allowed features, branding, available plans) is
   * managed once in the Stripe Dashboard.
   * TODO: automate via billingPortal.configurations.create in StripeCatalogSyncService.
   */
  async createPortalSession(
    tenantId: string,
    dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResponseDto> {
    const customerId =
      await this.stripeCustomerService.getOrCreateCustomer(tenantId);

    if (!customerId) {
      throw new BadRequestException(
        `Failed to resolve Stripe customer for tenant ${tenantId}`,
      );
    }

    const session =
      await this.stripeService.client.billingPortal.sessions.create({
        customer: customerId,
        return_url: dto.returnUrl,
      });

    this.logger.log(
      `Created Stripe Customer Portal session for tenant ${tenantId}`,
    );

    return { url: session.url };
  }
}
