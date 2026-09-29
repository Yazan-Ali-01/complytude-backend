import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import { StripeService } from '../stripe.service';

/** Marks the configuration this code manages, so it is found again instead of duplicated. */
const MANAGED_BY = 'complytude';

/**
 * The Stripe Customer Portal configuration, kept in code: customers can switch only between the
 * catalog's plan prices (so every change maps to a plan), cancel at the end of the period, and
 * manage payment methods, billing details and invoices. Every portal session uses it, so a
 * configuration edited by hand in the Dashboard can't offer prices the app doesn't know.
 */
@Injectable()
export class StripePortalConfigurationService {
  private readonly logger = new Logger(StripePortalConfigurationService.name);
  private configurationId?: Promise<string>;

  constructor(
    private readonly stripeService: StripeService,
    private readonly plansRepository: PlansRepository,
  ) {}

  /** The managed configuration's id (created or brought up to date once per process). */
  getId(): Promise<string> {
    this.configurationId ??= this.sync().catch((error: unknown) => {
      this.configurationId = undefined;
      throw error;
    });
    return this.configurationId;
  }

  /** Creates or updates the managed configuration from the current catalog. */
  async sync(): Promise<string> {
    const params = await this.params();
    const existing = await this.findManaged();
    const configuration = existing
      ? await this.stripeService.client.billingPortal.configurations.update(
          existing.id,
          params,
        )
      : await this.stripeService.client.billingPortal.configurations.create(
          params,
        );
    this.configurationId = Promise.resolve(configuration.id);
    this.logger.log(
      `Billing portal configuration ${existing ? 'updated' : 'created'}: ${configuration.id}`,
    );
    return configuration.id;
  }

  private async params(): Promise<Stripe.BillingPortal.ConfigurationCreateParams> {
    const plans = await this.plansRepository.findAll();
    const products = plans
      .filter((plan) => plan.is_active && plan.stripe_product_id)
      .map((plan) => ({
        product: plan.stripe_product_id!,
        prices: [
          plan.stripe_price_id_monthly,
          plan.stripe_price_id_annual,
        ].filter((price): price is string => !!price),
      }))
      .filter((product) => product.prices.length > 0);

    return {
      metadata: { managed_by: MANAGED_BY },
      features: {
        customer_update: {
          enabled: true,
          allowed_updates: ['email', 'address', 'tax_id'],
        },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          proration_behavior: 'none',
        },
        subscription_update: {
          enabled: products.length > 0,
          default_allowed_updates: ['price'],
          products,
          proration_behavior: 'create_prorations',
        },
      },
    };
  }

  private async findManaged(): Promise<Stripe.BillingPortal.Configuration | null> {
    const list =
      await this.stripeService.client.billingPortal.configurations.list({
        active: true,
        limit: 100,
      });
    return (
      list.data.find(
        (configuration) => configuration.metadata?.managed_by === MANAGED_BY,
      ) ?? null
    );
  }
}
