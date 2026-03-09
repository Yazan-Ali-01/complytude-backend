import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stripeConfig from 'src/config/stripe.config';
import { DatabaseModule } from 'src/database/database.module';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';
import { StripeService } from '../stripe.service';
import { StripeAdminController } from '../controllers/stripe-admin.controller';
import { StripeReconciliationService } from '../services/stripe-reconciliation.service';
import { AddonSyncEngine } from '../services/addon-sync-engine.service';
import { StripeCatalogSyncService } from '../services/stripe-catalog-sync.service';

@Module({
  imports: [ConfigModule.forFeature(stripeConfig), DatabaseModule],
  controllers: [StripeAdminController],
  providers: [
    StripeService,
    StripeReconciliationService,
    AddonSyncEngine,
    StripeCatalogSyncService,
    StripeWebhookEventsRepository,
  ],
  exports: [StripeReconciliationService],
})
export class StripeAdminModule {}
