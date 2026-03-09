import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import { BILLING_JOB_NAMES, QueueProducerService, QUEUE_NAMES } from '@lib/queue';
import { StripeService } from '../stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';

@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly webhookService: StripeWebhookService,
    private readonly queueProducer: QueueProducerService,
    private readonly webhookEventsRepository: StripeWebhookEventsRepository,
  ) {}

  /**
   * Stripe webhook receiver.
   *
   * - Public endpoint — signature verification is the sole auth mechanism.
   * - Returns 200 immediately after signature verification + idempotency check.
   * - Queues processing as BullMQ job to prevent Stripe timeouts.
   * - Returns 400 for invalid signatures.
   * - Returns 500 for database errors during initial event storage.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() request: FastifyRequest,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: true }> {
    if (!signature) {
      this.logger.warn('Webhook received without stripe-signature header');
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      event = this.stripeService.constructWebhookEvent(
        // rawBody is set by the preParsing hook in main.ts
        (request as unknown as { rawBody: Buffer }).rawBody,
        signature,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Stripe signature verification failed: ${msg}`);
      throw new BadRequestException(`Webhook signature verification failed`);
    }

    // Check for duplicate events (idempotency)
    const existing = await this.webhookEventsRepository.findByStripeEventId(
      event.id,
    );

    if (existing?.processingStatus === 'completed') {
      this.logger.log(`Duplicate event acknowledged — stripe_event_id: ${event.id}`);
      return { received: true };
    }

    // Store event as 'pending' (will be updated to 'processing' by the job)
    await this.webhookEventsRepository.upsertEvent(event, 'pending');

    // Queue the processing job
    await this.queueProducer.enqueue(
      QUEUE_NAMES.BILLING_PROCESSING,
      BILLING_JOB_NAMES.STRIPE_WEBHOOK_PROCESSING,
      {
        stripeEventId: event.id,
        eventType: event.type,
        eventData: event.data,
        attempt: 1,
      },
      {
        // Configure retry strategy
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2s, exponential backoff
        },
        // Remove job after completion to avoid memory buildup
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );

    this.logger.log(
      `Stripe webhook queued for processing: eventId=${event.id}, type=${event.type}`,
    );

    return { received: true };
  }
}
