import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { DatabaseService } from 'src/database/database.service';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { StripeService } from '../stripe.service';

export type TaxBackfillResult = {
  synced: number;
  skipped: number;
  failed: number;
};

/**
 * StripeTaxService
 *
 * Manages UAE VAT configuration on Stripe customers:
 *  - Syncs the customer's billing address (required for Stripe Tax to determine
 *    which tax rate to apply).
 *  - Syncs the UAE TRN (Tax Registration Number) as a Stripe Tax ID (type ae_trn).
 *    Stripe uses this to detect B2B transactions eligible for reverse-charge.
 *
 * All public methods are fire-and-forget safe: callers should use `void` and
 * never await in code paths where a Stripe error must not block the response.
 *
 * Requires STRIPE_TAX_ENABLED=true — every public method exits silently when
 * the flag is off, so callers don't need to guard.
 */
@Injectable()
export class StripeTaxService {
  private readonly logger = new Logger(StripeTaxService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Full tax sync for a tenant's Stripe customer:
   * 1. Updates the billing address on the Stripe Customer.
   * 2. Reconciles ae_trn Tax IDs (adds if TRN present and not yet registered;
   *    removes stale entries if TRN was cleared or changed).
   *
   * Safe to call fire-and-forget; all errors are logged, not re-thrown.
   */
  async syncCustomerTax(customerId: string, tenant: Tenant): Promise<void> {
    if (!this.isTaxEnabled()) return;

    try {
      await this.updateCustomerAddress(customerId, tenant);
      await this.reconcileTaxId(
        customerId,
        tenant.tax_registration_number ?? null,
      );
    } catch (error) {
      this.logger.error(
        `syncCustomerTax failed for customer ${customerId} (tenant ${tenant.id}): ${error.message}`,
        error,
      );
    }
  }

  /**
   * Backfill: iterate all tenants that already have a Stripe customer ID and
   * sync their address + TRN. Idempotent — safe to run multiple times.
   */
  async backfillCustomerTax(): Promise<TaxBackfillResult> {
    if (!this.isTaxEnabled()) {
      this.logger.warn(
        'backfillCustomerTax called but STRIPE_TAX_ENABLED is false — skipping',
      );
      return { synced: 0, skipped: 0, failed: 0 };
    }

    const result: TaxBackfillResult = { synced: 0, skipped: 0, failed: 0 };

    const tenants =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.tenantRepository.findWithStripeCustomer({ client }),
      );

    this.logger.log(
      `Starting tax backfill for ${tenants.length} tenant(s) with Stripe customers`,
    );

    for (const tenant of tenants) {
      if (!tenant.stripe_customer_id) {
        result.skipped++;
        continue;
      }
      try {
        await this.syncCustomerTax(tenant.stripe_customer_id, tenant);
        this.logger.log(
          `Tax synced for tenant ${tenant.id} (customer ${tenant.stripe_customer_id})`,
        );
        result.synced++;
      } catch (error) {
        this.logger.error(
          `Tax backfill failed for tenant ${tenant.id}: ${error.message}`,
          error,
        );
        result.failed++;
      }
    }

    this.logger.log(
      `Tax backfill complete: synced=${result.synced}, skipped=${result.skipped}, failed=${result.failed}`,
    );
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async updateCustomerAddress(
    customerId: string,
    tenant: Tenant,
  ): Promise<void> {
    const address: Stripe.CustomerUpdateParams['address'] = {
      country: 'AE',
      state: tenant.emirate ?? undefined,
      city: tenant.city ?? undefined,
      line1: tenant.address_line_1 ?? undefined,
      line2: tenant.address_line_2 ?? undefined,
      postal_code: tenant.postal_code ?? undefined,
    };

    await this.stripeService.client.customers.update(customerId, { address });
    this.logger.debug(`Updated address for Stripe customer ${customerId}`);
  }

  /**
   * Reconcile the ae_trn Tax ID on the customer:
   * - If trn is provided: list existing ae_trn IDs; add the new one if missing
   *   or if the value changed (deletes the stale entry first).
   * - If trn is null/empty: delete all ae_trn Tax IDs.
   */
  private async reconcileTaxId(
    customerId: string,
    trn: string | null,
  ): Promise<void> {
    const existing = await this.listAeTrnIds(customerId);

    if (!trn) {
      // No TRN — remove any that exist
      await Promise.all(
        existing.map((taxId) =>
          this.stripeService.client.customers.deleteTaxId(customerId, taxId.id),
        ),
      );
      if (existing.length > 0) {
        this.logger.debug(
          `Removed ${existing.length} stale ae_trn Tax ID(s) from customer ${customerId}`,
        );
      }
      return;
    }

    // TRN present
    const alreadyMatched = existing.find((t) => t.value === trn);
    if (alreadyMatched) {
      // Stale duplicates (shouldn't happen, but be defensive)
      const stale = existing.filter((t) => t.id !== alreadyMatched.id);
      await Promise.all(
        stale.map((t) =>
          this.stripeService.client.customers.deleteTaxId(customerId, t.id),
        ),
      );
      this.logger.debug(
        `ae_trn already up to date for customer ${customerId}: ${trn}`,
      );
      return;
    }

    // Remove any entries with a different value, then add the correct one
    await Promise.all(
      existing.map((t) =>
        this.stripeService.client.customers.deleteTaxId(customerId, t.id),
      ),
    );

    await this.stripeService.client.customers.createTaxId(customerId, {
      type: 'ae_trn',
      value: trn,
    });
    this.logger.debug(`Added ae_trn Tax ID to customer ${customerId}: ${trn}`);
  }

  private async listAeTrnIds(customerId: string): Promise<Stripe.TaxId[]> {
    const taxIds = await this.stripeService.client.customers.listTaxIds(
      customerId,
      { limit: 100 },
    );
    return taxIds.data.filter((t) => t.type === 'ae_trn');
  }

  private isTaxEnabled(): boolean {
    return this.configService.get<boolean>('stripe.taxEnabled', false);
  }
}
