import { Injectable, Logger } from '@nestjs/common';
import { Job, StripeWebhookProcessingJobData } from '@lib/queue';
import Stripe from 'stripe';
import { StripeWebhookService } from '../../stripe/webhook/stripe-webhook.service';

@Injectable()
export class StripeWebhookProcessingHandler {
  private readonly logger = new Logger(StripeWebhookProcessingHandler.name);

  constructor(
    private readonly stripeWebhookService: StripeWebhookService,
  ) {}

  async execute(job: Job<StripeWebhookProcessingJobData>): Promise<void> {
    const { stripeEventId, eventType, eventData, attempt } = job.data;

    this.logger.log(
      `Processing Stripe webhook job: eventId=${stripeEventId}, type=${eventType}, attempt=${attempt}`,
    );

    try {
      // Reconstruct the Stripe event object from the job data
      const stripeEvent: Stripe.Event = {
        id: stripeEventId,
        type: eventType as any,
        data: eventData as any,
        // Add minimal required fields for Stripe.Event interface
        object: 'event',
        api_version: null,
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: null,
      };

      // Process the event using the existing webhook service
      await this.stripeWebhookService.processEvent(stripeEvent);

      this.logger.log(
        `Stripe webhook processing completed: eventId=${stripeEventId}`,
      );
    } catch (error) {
      this.logger.error(
        `Stripe webhook processing failed: eventId=${stripeEventId}, attempt=${attempt}`,
        error instanceof Error ? error.stack : error,
      );
      
      // Re-throw to let BullMQ handle retries
      throw error;
    }
  }
}