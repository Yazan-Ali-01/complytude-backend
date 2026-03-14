import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stripeConfig from 'src/config/stripe.config';
import { DatabaseModule } from '@lib/database';
import { QueueModule } from '@lib/queue';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';
import { StripeService } from '../stripe.service';
import { StripeWebhookController } from '../webhook/stripe-webhook.controller';
import { StripeWebhookService } from '../webhook/stripe-webhook.service';
import { StripeEventHandlersService } from '../webhook/stripe-event-handlers';
import { AddonSyncEngine } from '../services/addon-sync-engine.service';
import { StripeWebhookMonitoringService } from '../services/stripe-webhook-monitoring.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(stripeConfig), DatabaseModule, QueueModule],
  controllers: [StripeWebhookController],
  providers: [
    StripeService,
    StripeWebhookService,
    StripeWebhookEventsRepository,
    StripeEventHandlersService,
    AddonSyncEngine,
    StripeWebhookMonitoringService,
  ],
  exports: [StripeWebhookService, StripeEventHandlersService],
})
export class StripeWebhookModule {}
