import { Injectable, Logger } from '@nestjs/common';
import { Job, StripeReconciliationJobData } from '@lib/queue';
import { StripeReconciliationService } from '../../stripe/services/stripe-reconciliation.service';

@Injectable()
export class StripeReconciliationHandler {
  private readonly logger = new Logger(StripeReconciliationHandler.name);

  constructor(
    private readonly stripeReconciliationService: StripeReconciliationService,
  ) {}

  async execute(job: Job<StripeReconciliationJobData>): Promise<void> {
    const data = job.data;

    this.logger.log(
      `Processing Stripe reconciliation job: tenantId=${data.tenantId}, reason=${data.reason}`,
    );

    try {
      await this.stripeReconciliationService.reconcile(data.tenantId);

      if (data.tenantId) {
        this.logger.log(
          `Stripe reconciliation completed for tenant=${data.tenantId}`,
        );
      } else {
        this.logger.log('Stripe reconciliation completed for all tenants');
      }
    } catch (error) {
      this.logger.error(
        `Failed to reconcile Stripe data: tenantId=${data.tenantId}, reason=${data.reason}`,
        error.stack,
      );
      throw error; // Re-throw to trigger BullMQ retry
    }
  }
}
