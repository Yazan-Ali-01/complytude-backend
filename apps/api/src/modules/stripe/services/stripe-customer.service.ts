import { DatabaseService } from '@lib/database';
import { Injectable, Logger } from '@nestjs/common';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { StripeService } from '../stripe.service';
import { StripeTaxService } from './stripe-tax.service';

export type BackfillResult = {
  created: number;
  skipped: number;
  failed: number;
};

@Injectable()
export class StripeCustomerService {
  private readonly logger = new Logger(StripeCustomerService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly stripeTaxService: StripeTaxService,
  ) {}

  /**
   * Create the tenant's Stripe customer and persist the ID (the tenant-creation job).
   * Idempotent: returns the existing customer if the tenant already has one, and throws on
   * failure so the job retries.
   */
  async createCustomerForTenant(
    tenant: Tenant,
    creatorEmail?: string,
  ): Promise<string> {
    const customerId = await this.ensureCustomer(tenant.id, creatorEmail);
    if (!customerId) {
      throw new Error(`Tenant ${tenant.id} not found`);
    }
    return customerId;
  }

  /**
   * Return the Stripe customer ID for a tenant, creating one on-the-fly if
   * it is missing. This is the defensive fallback used by downstream billing
   * operations (subscriptions, invoices, etc.).
   */
  async getOrCreateCustomer(tenantId: string): Promise<string | null> {
    return this.ensureCustomer(tenantId);
  }

  /**
   * One Stripe customer per tenant, however many requests or job retries race to create it:
   * the Stripe call is keyed by tenant and made outside any DB transaction, and the first ID
   * stored on the tenant wins. Returns null if the tenant doesn't exist.
   */
  private async ensureCustomer(
    tenantId: string,
    fallbackEmail?: string,
  ): Promise<string | null> {
    const found =
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) => {
          const tenant = await this.tenantRepository.findById(tenantId, {
            client,
          });
          if (!tenant || tenant.stripe_customer_id) {
            return { tenant, adminEmail: null };
          }
          const adminEmail =
            await this.userTenantRepository.findTenantAdminEmail(tenantId, {
              client,
            });
          return { tenant, adminEmail };
        },
      );

    if (!found.tenant) {
      this.logger.warn(`ensureCustomer: tenant ${tenantId} not found`);
      return null;
    }
    if (found.tenant.stripe_customer_id) {
      return found.tenant.stripe_customer_id;
    }

    const tenant = found.tenant;
    // Every caller sends the same parameters for the tenant: Stripe rejects a reused key with
    // different parameters.
    const customer = await this.stripeService.client.customers.create(
      {
        email: found.adminEmail ?? fallbackEmail,
        name: tenant.name ?? undefined,
        metadata: { complytude_tenant_id: tenant.id },
      },
      { idempotencyKey: `customer:${tenant.id}` },
    );

    const storedId =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.tenantRepository.setStripeCustomerIdIfMissing(
          tenant.id,
          customer.id,
          { client },
        ),
      );
    if (!storedId) {
      throw new Error(
        `Tenant ${tenant.id} disappeared while creating its Stripe customer`,
      );
    }
    if (storedId !== customer.id) {
      this.logger.warn(
        `Tenant ${tenant.id} already had Stripe customer ${storedId}; ${customer.id} is unused`,
      );
      return storedId;
    }

    this.logger.log(
      `Created Stripe customer ${customer.id} for tenant ${tenant.id}`,
    );

    // syncCustomerTax logs its own errors; this catch is the backstop for a fire-and-forget call
    this.stripeTaxService
      .syncCustomerTax(customer.id, tenant)
      .catch((error: unknown) => {
        this.logger.error(
          `Tax sync failed for customer ${customer.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return customer.id;
  }

  /**
   * Reverse lookup: given a Stripe customer ID, return the corresponding
   * tenant (needed for webhook processing).
   */
  async findTenantByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<Tenant | null> {
    return this.databaseService.transactionWithPlatformAdminContext((client) =>
      this.tenantRepository.findByStripeCustomerId(stripeCustomerId, {
        client,
      }),
    );
  }

  /**
   * One-time backfill: iterate all tenants that don't have a Stripe customer
   * ID yet, create one for each, and store the result.
   */
  async backfillStripeCustomers(): Promise<BackfillResult> {
    const result: BackfillResult = { created: 0, skipped: 0, failed: 0 };

    const tenants =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.tenantRepository.findWithoutStripeCustomer({ client }),
      );

    this.logger.log(
      `Starting Stripe customer backfill for ${tenants.length} tenant(s)`,
    );

    for (const tenant of tenants) {
      try {
        await this.ensureCustomer(tenant.id);

        this.logger.log(`Backfilled Stripe customer for tenant ${tenant.id}`);
        result.created++;
      } catch (error) {
        this.logger.error(
          `Failed to backfill tenant ${tenant.id}: ${error.message}`,
          error,
        );
        result.failed++;
      }
    }

    this.logger.log(
      `Backfill complete: created=${result.created}, skipped=${result.skipped}, failed=${result.failed}`,
    );

    return result;
  }
}
