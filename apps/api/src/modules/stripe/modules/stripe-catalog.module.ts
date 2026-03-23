import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stripeConfig from 'src/config/stripe.config';
import { DatabaseModule } from '@lib/database';
import { CreditPackagesRepository } from 'src/repositories/credits/credit-packages.repository';
import { StripeService } from '../stripe.service';
import { StripeCatalogSyncService } from '../services/stripe-catalog-sync.service';

@Module({
  imports: [ConfigModule.forFeature(stripeConfig), DatabaseModule],
  providers: [
    StripeService,
    StripeCatalogSyncService,
    CreditPackagesRepository,
  ],
  exports: [StripeCatalogSyncService],
})
export class StripeCatalogModule {}
