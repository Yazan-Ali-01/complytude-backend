import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stripeConfig from 'src/config/stripe.config';
import { DatabaseModule } from 'src/database/database.module';
import { StripeService } from '../stripe.service';
import { StripeCatalogSyncService } from '../services/stripe-catalog-sync.service';

@Module({
  imports: [ConfigModule.forFeature(stripeConfig), DatabaseModule],
  providers: [StripeService, StripeCatalogSyncService],
  exports: [StripeCatalogSyncService],
})
export class StripeCatalogModule {}
