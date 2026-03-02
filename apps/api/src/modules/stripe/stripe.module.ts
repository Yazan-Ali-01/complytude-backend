import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stripeConfig from 'src/config/stripe.config';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';
import { StripeService } from './stripe.service';
import { StripeEventHandlersService } from './webhook/stripe-event-handlers';
import { StripeWebhookController } from './webhook/stripe-webhook.controller';
import { StripeWebhookService } from './webhook/stripe-webhook.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(stripeConfig)],
  controllers: [StripeWebhookController],
  providers: [
    StripeService,
    StripeWebhookService,
    StripeWebhookEventsRepository,
    StripeEventHandlersService,
  ],
  exports: [StripeService],
})
export class StripeModule {}
