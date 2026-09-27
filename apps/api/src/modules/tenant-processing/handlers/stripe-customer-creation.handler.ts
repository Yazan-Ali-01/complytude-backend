import { DatabaseService } from '@lib/database';
import { Job, TenantStripeCustomerCreationJobData } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { TenantRepository } from '../../../repositories/tenants/tenant.repository';
import { StripeCustomerService } from '../../stripe/services/stripe-customer.service';

@Injectable()
export class StripeCustomerCreationHandler {
  private readonly logger = new Logger(StripeCustomerCreationHandler.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
    private readonly stripeCustomerService: StripeCustomerService,
  ) {}

  async execute(job: Job<TenantStripeCustomerCreationJobData>): Promise<void> {
    const { tenantId, email, userId } = job.data;

    this.logger.log(
      `Creating Stripe customer for tenant=${tenantId} attempt=${job.attemptsMade + 1}`,
    );

    const tenant =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.tenantRepository.findById(tenantId, { client }),
      );

    if (!tenant) {
      // Tenant deleted between enqueue and execution — no point retrying
      this.logger.warn(
        `Stripe customer creation skipped: tenant ${tenantId} not found`,
      );
      return;
    }

    if (tenant.stripe_customer_id) {
      this.logger.log(
        `Stripe customer already exists for tenant=${tenantId}, skipping`,
      );
      return;
    }

    await this.stripeCustomerService.createCustomerForTenant(
      tenant,
      email,
      userId,
    );
  }
}
