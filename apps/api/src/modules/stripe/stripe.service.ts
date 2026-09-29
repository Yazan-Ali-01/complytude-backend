import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private stripeClient: Stripe;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const secretKey = this.configService.getOrThrow<string>('stripe.secretKey');
    const apiVersion =
      this.configService.getOrThrow<string>('stripe.apiVersion');

    this.stripeClient = new Stripe(secretKey, {
      apiVersion: apiVersion as Stripe.LatestApiVersion,
      // Retried POSTs carry an automatic idempotency key
      maxNetworkRetries: 2,
      timeout: 30_000,
    });

    this.logger.log('Stripe client initialized');
  }

  get client(): Stripe {
    return this.stripeClient;
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.getOrThrow<string>(
      'stripe.webhookSecret',
    );
    const event = this.stripeClient.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
    // A test-mode event on the live deployment (or the reverse) is from the wrong account
    const live = this.configService.get<string>('stripe.mode') === 'live';
    if (event.livemode !== live) {
      throw new Error(
        `Stripe event ${event.id} is livemode=${event.livemode}, this deployment is ${live ? 'live' : 'test'}`,
      );
    }
    return event;
  }
}
