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
import { StripeService } from '../stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';

@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly webhookService: StripeWebhookService,
  ) {}

  /**
   * Stripe webhook receiver.
   *
   * - Public endpoint — signature verification is the sole auth mechanism.
   * - Returns 200 for all successfully received events (including unhandled types).
   * - Returns 400 for invalid signatures.
   * - Returns 500 for processing errors so Stripe retries with exponential backoff.
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

    await this.webhookService.processEvent(event);

    return { received: true };
  }
}
