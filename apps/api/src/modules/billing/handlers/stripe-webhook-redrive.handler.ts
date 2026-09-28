import { Injectable } from '@nestjs/common';
import { StripeWebhookMonitoringService } from '../../stripe/services/stripe-webhook-monitoring.service';

/** Runs the scheduled re-drive of failed and stranded Stripe webhook events. */
@Injectable()
export class StripeWebhookRedriveHandler {
  constructor(
    private readonly monitoringService: StripeWebhookMonitoringService,
  ) {}

  async execute(): Promise<void> {
    await this.monitoringService.redriveDueEvents();
  }
}
