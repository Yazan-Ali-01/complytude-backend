import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '@lib/database';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import Stripe from 'stripe';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { StripeService } from '../stripe.service';
import { StripeTaxService } from './stripe-tax.service';

export type BackfillResult = {
  created: number;
  skipped: number;
  failed: number;
};

type CreateStripeCustomerOptions = {
  email?: string;
  metadata?: Record<string, string>;
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
   * Create a Stripe customer for a tenant and persist the ID.
   *
   * Non-fatal: errors are logged but not re-thrown, because Stripe customer
   * creation must never block tenant signup. Use `getOrCreateCustomer` to
   * recover lazily if this silently fails.
   *
   * Note: returns the tenant as-is (stripe_customer_id will be null on the
   * returned object). Callers that need the resolved ID should use
   * `getOrCreateCustomer`.
   */
  async createCustomerForTenant(
    tenant: Tenant,
    creatorEmail?: string,
    creatorUserId?: string,
  ): Promise<string | null> {
    try {
      const customerId = await this.createStripeCustomerAndPersist(tenant, {
        email: creatorEmail,
        metadata: {
          complytude_tenant_id: tenant.id,
          ...(creatorUserId && { complytude_user_id: creatorUserId }),
        },
      });

      this.logger.log(
        `Created Stripe customer ${customerId} for tenant ${tenant.id}`,
      );

      return customerId;
    } catch (error) {
      this.logger.error(
        `Failed to create Stripe customer for tenant ${tenant.id}: ${error.message}`,
        error,
      );
      return null;
    }
  }

  /**
   * Return the Stripe customer ID for a tenant, creating one on-the-fly if
   * it is missing. This is the defensive fallback used by downstream billing
   * operations (subscriptions, invoices, etc.).
   */
  async getOrCreateCustomer(tenantId: string): Promise<string | null> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const tenant = await this.tenantRepository.findById(tenantId, {
          client,
        });

        if (!tenant) {
          this.logger.warn(`getOrCreateCustomer: tenant ${tenantId} not found`);
          return null;
        }

        if (tenant.stripe_customer_id) {
          return tenant.stripe_customer_id;
        }

        const adminEmail = await this.userTenantRepository.findTenantAdminEmail(
          tenantId,
          {
            client,
          },
        );

        return this.createStripeCustomerAndPersist(
          tenant,
          {
            email: adminEmail ?? undefined,
            metadata: {
              complytude_tenant_id: tenant.id,
            },
          },
          client,
        );
      },
    );
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
        await this.databaseService.transactionWithPlatformAdminContext(
          async (client) => {
            const adminEmail =
              await this.userTenantRepository.findTenantAdminEmail(tenant.id, {
                client,
              });

            await this.createStripeCustomerAndPersist(
              tenant,
              {
                email: adminEmail ?? undefined,
                metadata: {
                  complytude_tenant_id: tenant.id,
                  backfilled: 'true',
                },
              },
              client,
            );
          },
        );

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

  /**
   * Create a Stripe customer via the API and persist the resulting ID to the
   * tenant row. Runs the DB write in a platform admin context so RLS permits
   * the UPDATE.
   *
   * When `client` is provided, uses that client (caller's transaction).
   * Otherwise starts a new platform admin transaction.
   *
   * After persisting, fires a non-blocking tax sync so the customer's UAE address
   * and TRN are registered with Stripe Tax immediately.
   */
  private async createStripeCustomerAndPersist(
    tenant: Tenant,
    options: CreateStripeCustomerOptions,
    client?: PoolClient,
  ): Promise<string> {
    const customer: Stripe.Customer =
      await this.stripeService.client.customers.create({
        email: options.email,
        name: tenant.name ?? undefined,
        metadata: options.metadata ?? {},
      });

    if (client) {
      await this.tenantRepository.updateStripeCustomerId(
        tenant.id,
        customer.id,
        {
          client,
        },
      );
    } else {
      await this.databaseService.transactionWithPlatformAdminContext((c) =>
        this.tenantRepository.updateStripeCustomerId(tenant.id, customer.id, {
          client: c,
        }),
      );
    }

    void this.stripeTaxService.syncCustomerTax(customer.id, tenant);

    return customer.id;
  }
}
