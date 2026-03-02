import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PlanKey } from 'src/common/types/entitlement.types';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import {
  CheckoutSessionResponseDto,
  CreateCheckoutSessionDto,
} from '../dto/create-checkout-session.dto';
import { StripeCustomerService } from './stripe-customer.service';
import { StripeService } from '../stripe.service';

@Injectable()
export class StripeCheckoutService {
  private readonly logger = new Logger(StripeCheckoutService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly stripeCustomerService: StripeCustomerService,
    private readonly plansRepository: PlansRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a Stripe Checkout Session for a subscription plan upgrade.
   *
   * Flow:
   * 1. Resolve the plan record and its Stripe price ID.
   * 2. Get or create the Stripe customer for the tenant.
   * 3. Create a Checkout Session in subscription mode.
   * 4. Return the hosted URL.
   */
  async createCheckoutSession(
    tenantId: string,
    dto: CreateCheckoutSessionDto,
  ): Promise<CheckoutSessionResponseDto> {
    const plan = await this.plansRepository.findByKey(dto.planKey as PlanKey);
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${dto.planKey}`);
    }

    const priceId =
      dto.interval === 'annual'
        ? plan.stripe_price_id_annual
        : plan.stripe_price_id_monthly;

    if (!priceId) {
      throw new BadRequestException(
        `No Stripe price configured for plan "${dto.planKey}" (${dto.interval}). ` +
          'Ensure the catalog sync has run successfully.',
      );
    }

    const customerId =
      await this.stripeCustomerService.getOrCreateCustomer(tenantId);

    if (!customerId) {
      throw new BadRequestException(
        `Failed to resolve Stripe customer for tenant ${tenantId}`,
      );
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: dto.successUrl,
      cancel_url: dto.cancelUrl,
      metadata: {
        complytude_tenant_id: tenantId,
        plan_key: dto.planKey,
        interval: dto.interval,
      },
      subscription_data: {
        metadata: {
          complytude_tenant_id: tenantId,
          plan_key: dto.planKey,
          interval: dto.interval,
        },
      },
      ...(this.isTaxEnabled() && {
        automatic_tax: { enabled: true },
      }),
    };

    const session =
      await this.stripeService.client.checkout.sessions.create(sessionParams);

    this.logger.log(
      `Created Stripe Checkout session ${session.id} for tenant ${tenantId} (plan: ${dto.planKey}, interval: ${dto.interval})`,
    );

    return {
      checkoutUrl: session.url!,
      sessionId: session.id,
    };
  }

  private isTaxEnabled(): boolean {
    return this.configService.get<boolean>('stripe.taxEnabled', false);
  }
}
