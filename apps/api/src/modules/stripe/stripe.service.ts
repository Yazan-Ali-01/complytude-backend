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
    return this.stripeClient.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }
}
