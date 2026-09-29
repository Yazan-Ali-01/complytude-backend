import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { PlanKey } from 'src/common/types/entitlement.types';
import { CreditPackagesRepository } from 'src/repositories/credits/credit-packages.repository';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import {
  CheckoutSessionResponseDto,
  CreateCheckoutSessionDto,
} from '../dto/create-checkout-session.dto';
import { CreateCreditCheckoutDto } from '../dto/create-credit-checkout.dto';
import { StripeCustomerService } from './stripe-customer.service';
import {
  allowedRedirectOrigins,
  assertAllowedRedirect,
} from '../redirect-allowlist';
import { StripeService } from '../stripe.service';

/** Stripe statuses of a subscription that still exists and may bill the customer. */
const LIVE_STRIPE_SUBSCRIPTION_STATUSES: ReadonlySet<Stripe.Subscription.Status> =
  new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

/** Identifies a checkout request by its parameters (used for idempotency keys). */
function hashCheckoutParams(
  params: Stripe.Checkout.SessionCreateParams,
): string {
  return createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .slice(0, 32);
}

@Injectable()
export class StripeCheckoutService {
  private readonly logger = new Logger(StripeCheckoutService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly stripeCustomerService: StripeCustomerService,
    private readonly plansRepository: PlansRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly creditPackagesRepository: CreditPackagesRepository,
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
    this.assertRedirects(dto.successUrl, dto.cancelUrl);
    await this.assertNoLiveSubscription(tenantId);

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

    // Covers a subscription whose checkout completed before its webhook was processed
    await this.assertNoLiveStripeSubscription(customerId);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: dto.successUrl,
      cancel_url: dto.cancelUrl,
      metadata: {
        complytude_tenant_id: tenantId,
        checkout_type: 'subscription_checkout',
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

    const requestHash = hashCheckoutParams(sessionParams);
    sessionParams.metadata = {
      ...sessionParams.metadata,
      checkout_request: requestHash,
    };
    // Only one subscription checkout may be completable at a time: another tab's session for a
    // different plan would otherwise create a second subscription
    await this.expireOtherOpenSubscriptionCheckouts(customerId, requestHash);

    const session = await this.createSession(
      sessionParams,
      `checkout:${tenantId}:${requestHash}`,
    );

    this.logger.log(
      `Created Stripe Checkout session ${session.id} for tenant ${tenantId} (plan: ${dto.planKey}, interval: ${dto.interval})`,
    );

    return {
      checkoutUrl: session.url!,
      sessionId: session.id,
    };
  }

  /**
   * Create a Stripe Checkout Session for a one-time credit purchase.
   *
   * Flow:
   * 1. Look up the credit package DB record (has Stripe price ID from catalog sync).
   * 2. Get or create the Stripe customer for the tenant.
   * 3. Create a Checkout Session in payment mode (one-time, not subscription).
   * 4. Return the hosted URL.
   */
  async createCreditPurchaseCheckout(
    tenantId: string,
    dto: CreateCreditCheckoutDto,
  ): Promise<CheckoutSessionResponseDto> {
    this.assertRedirects(dto.successUrl, dto.cancelUrl);
    const pkg = await this.creditPackagesRepository.findByKey(dto.packageKey);
    if (!pkg) {
      throw new NotFoundException(
        `Credit package not found: ${dto.packageKey}`,
      );
    }

    if (!pkg.stripe_price_id) {
      throw new BadRequestException(
        `No Stripe price configured for credit package "${dto.packageKey}". ` +
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
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: pkg.stripe_price_id, quantity: 1 }],
      success_url: `${dto.successUrl}${dto.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: dto.cancelUrl,
      payment_method_types: ['card'],
      metadata: {
        complytude_tenant_id: tenantId,
        checkout_type: 'credit_purchase',
        credit_package_key: dto.packageKey,
        credits_amount: String(pkg.credits),
      },
      ...(this.isTaxEnabled() && {
        automatic_tax: { enabled: true },
      }),
    };

    const session = await this.createSession(
      sessionParams,
      `credit-checkout:${tenantId}:${hashCheckoutParams(sessionParams)}`,
    );

    this.logger.log(
      `Created credit purchase Checkout session ${session.id} for tenant ${tenantId} (package: ${dto.packageKey}, credits: ${pkg.credits})`,
    );

    return {
      checkoutUrl: session.url!,
      sessionId: session.id,
    };
  }

  /** A tenant with a Stripe subscription (paid, trialing or past due) manages it in the portal. */
  private async assertNoLiveSubscription(tenantId: string): Promise<void> {
    const [existing] = await this.subscriptionsRepository.findAllWithStripeId(
      tenantId,
      { tenant: { tenantId, schema: 'public' } },
    );
    if (existing) {
      throw new ConflictException(
        `Tenant already has a Stripe subscription (${existing.status}). ` +
          'Use the plan change flow to switch plans, or the billing portal to update payment details.',
      );
    }
  }

  private async assertNoLiveStripeSubscription(
    customerId: string,
  ): Promise<void> {
    const subscriptions = await this.stripeService.client.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
    });
    const live = subscriptions.data.find((subscription) =>
      LIVE_STRIPE_SUBSCRIPTION_STATUSES.has(subscription.status),
    );
    if (live) {
      throw new ConflictException(
        `A Stripe subscription (${live.status}) already exists for this tenant. ` +
          'Use the billing portal to manage it.',
      );
    }
  }

  private async expireOtherOpenSubscriptionCheckouts(
    customerId: string,
    requestHash: string,
  ): Promise<void> {
    const open = await this.stripeService.client.checkout.sessions.list({
      customer: customerId,
      status: 'open',
      limit: 20,
    });
    for (const session of open.data) {
      if (
        session.mode !== 'subscription' ||
        session.metadata?.checkout_request === requestHash
      ) {
        continue;
      }
      try {
        await this.stripeService.client.checkout.sessions.expire(session.id);
        this.logger.log(
          `Expired superseded Checkout session ${session.id} for customer ${customerId}`,
        );
      } catch (error) {
        // It may have completed meanwhile; the live-subscription check catches that next time
        this.logger.warn(
          `Could not expire Checkout session ${session.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Creates a Checkout Session keyed by the request, so a double click returns the same session.
   * Stripe replays a key's original response for 24 h, so a replayed session is re-read: if it
   * has completed or expired since, a new one is created, keyed by the stale one so a double
   * click still converges on a single session.
   */
  /** Stripe sends the customer back to these: only to our own web app. */
  private assertRedirects(...urls: string[]): void {
    const allowed = allowedRedirectOrigins(this.configService);
    for (const url of urls) assertAllowedRedirect(url, allowed);
  }

  private async createSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
  ): Promise<Stripe.Checkout.Session> {
    let key = idempotencyKey;
    for (let attempt = 0; attempt < 3; attempt++) {
      const created = await this.stripeService.client.checkout.sessions.create(
        params,
        { idempotencyKey: key },
      );
      const replayed =
        created.lastResponse?.headers?.['idempotent-replayed'] === 'true';
      const session = replayed
        ? await this.stripeService.client.checkout.sessions.retrieve(created.id)
        : created;
      if (session.status === 'open') {
        return session;
      }
      key = `${idempotencyKey}:after:${session.id}`;
    }
    throw new Error(
      `Could not open a Checkout session for key ${idempotencyKey}: every candidate was closed`,
    );
  }

  private isTaxEnabled(): boolean {
    return this.configService.get<boolean>('stripe.taxEnabled', false);
  }
}
