import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Tenant } from '../../tenants/entities/tenant.entity';

/**
 * Service for Stripe customer operations.
 *
 * Fire-and-forget pattern: createCustomerForTenant never throws.
 * Errors are logged but do not propagate — tenant creation must not fail
 * if Stripe API is unavailable.
 */
@Injectable()
export class StripeCustomerService {
  private readonly logger = new Logger(StripeCustomerService.name);
  private readonly stripe: Stripe | null = null;
  private readonly skipCreation: boolean;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('stripe.secretKey') || '';
    this.skipCreation =
      this.configService.get<boolean>('stripe.skipCustomerCreation') === true ||
      !secretKey.trim();

    if (!this.skipCreation && secretKey) {
      this.stripe = new Stripe(secretKey);
    } else {
      this.logger.log(
        'Stripe customer creation disabled (STRIPE_SKIP_CUSTOMER_CREATION=true or STRIPE_SECRET_KEY empty)',
      );
    }
  }

  /**
   * Create a Stripe customer for a tenant (fire-and-forget, non-blocking).
   *
   * Sets email on the customer for Stripe dashboard identification and receipts.
   * Sets metadata.creator_user_id for traceability.
   * Handles null email gracefully — creates customer without email if not provided.
   *
   * Never throws. Logs errors for graceful degradation.
   */
  createCustomerForTenant(
    tenant: Tenant,
    creatorEmail: string | null,
    creatorUserId: string | null,
  ): void {
    if (this.skipCreation) {
      this.logger.log(
        `[Stripe] Would create customer for tenant=${tenant.id} (log-only mode)`,
      );
      return;
    }

    if (!this.stripe) {
      this.logger.warn(
        `[Stripe] Customer not created for tenant=${tenant.id}: Stripe not configured`,
      );
      return;
    }

    const params: Stripe.CustomerCreateParams = {
      name: tenant.name ?? undefined,
      metadata: {
        tenant_id: tenant.id,
        ...(creatorUserId && { creator_user_id: creatorUserId }),
      },
    };

    if (creatorEmail && creatorEmail.trim()) {
      params.email = creatorEmail.trim();
    }

    this.stripe.customers
      .create(params)
      .then((customer) => {
        this.logger.log(
          `[Stripe] Customer created for tenant=${tenant.id}, stripe_customer_id=${customer.id}`,
        );
      })
      .catch((err) => {
        this.logger.error(
          `[Stripe] Failed to create customer for tenant=${tenant.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
