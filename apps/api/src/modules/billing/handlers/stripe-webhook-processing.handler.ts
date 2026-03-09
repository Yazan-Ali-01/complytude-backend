import { Injectable, Logger } from '@nestjs/common';
import { Job, StripeWebhookProcessingJobData } from '@lib/queue';
import { StripeWebhookService } from '../../stripe/webhook/stripe-webhook.service';

@Injectable()
export class StripeWebhookProcessingHandler {
  private readonly logger = new Logger(StripeWebhookProcessingHandler.name);

  constructor(private readonly stripeWebhookService: StripeWebhookService) {}

  async execute(job: Job<StripeWebhookProcessingJobData>): Promise<void> {
    const { stripeEventId } = job.data;

    this.logger.log(
      `Processing Stripe webhook job: eventId=${stripeEventId}, attempt=${job.attemptsMade + 1}`,
    );

    try {
      const stripeEvent =
        await this.stripeWebhookService.getEventById(stripeEventId);

      if (!stripeEvent) {
        throw new Error(
          `Stripe webhook event not found in DB: ${stripeEventId}`,
        );
      }

      await this.stripeWebhookService.processEvent(stripeEvent);

      this.logger.log(
        `Stripe webhook processing completed: eventId=${stripeEventId}`,
      );
    } catch (error) {
      this.logger.error(
        `Stripe webhook processing failed: eventId=${stripeEventId}, attempt=${job.attemptsMade + 1}`,
        error instanceof Error ? error.stack : error,
      );

      // Re-throw to let BullMQ handle retries
      throw error;
    }
  }
}
