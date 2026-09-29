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
import {
  BILLING_JOB_NAMES,
  QueueProducerService,
  QUEUE_NAMES,
} from '@lib/queue';
import { Public } from '../../auth/decorators/auth-options.decorator';
import { WEBHOOK_PROCESSING_STATUS } from 'src/common/types/stripe.types';
import { WEBHOOK_JOB_ATTEMPTS } from '../stripe.constants';
import { I18nService } from 'nestjs-i18n';
import { BillingI18n } from '../constants/i18n.constants';
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
    private readonly i18n: I18nService,
  ) {}

  /**
   * Stripe webhook receiver.
   *
   * - Public endpoint — signature verification is the sole auth mechanism.
   * - Returns 200 once the event is stored (repeat deliveries are counted, not re-stored).
   * - Queues processing as BullMQ job to prevent Stripe timeouts.
   * - Returns 400 for invalid signatures.
   * - Returns 500 for database errors during initial event storage.
   */
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() request: FastifyRequest,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: true }> {
    if (!signature) {
      this.logger.warn('Webhook received without stripe-signature header');
      throw new BadRequestException(
        this.i18n.t(BillingI18n.errors.WEBHOOK_SIGNATURE_MISSING),
      );
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
      throw new BadRequestException(
        this.i18n.t(BillingI18n.errors.WEBHOOK_SIGNATURE_INVALID),
      );
    }

    // Store the event (or count a repeat delivery) before acknowledging it
    const stored = await this.webhookEventsRepository.recordDelivery(event);

    if (stored.processingStatus === WEBHOOK_PROCESSING_STATUS.COMPLETED) {
      this.logger.log(
        `Duplicate event acknowledged — stripe_event_id: ${event.id}`,
      );
      return { received: true };
    }

    // The job ID is the event ID, so a repeat delivery doesn't queue a second job while the first
    // exists. Processing claims the event atomically either way; failed events are re-driven by
    // the scheduled sweep.
    await this.queueProducer.enqueue(
      QUEUE_NAMES.BILLING_PROCESSING,
      BILLING_JOB_NAMES.STRIPE_WEBHOOK_PROCESSING,
      { stripeEventId: event.id },
      {
        jobId: event.id,
        attempts: WEBHOOK_JOB_ATTEMPTS,
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
