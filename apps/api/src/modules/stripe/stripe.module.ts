import { Module } from '@nestjs/common';
import {
  StripeWebhookModule,
  StripeBillingModule,
  StripeCatalogModule,
  StripeAdminModule,
} from './modules';

/**
 * Main Stripe module that aggregates all Stripe-related functionality.
 *
 * This module is no longer @Global() - import specific modules as needed:
 * - StripeWebhookModule: Webhook handling
 * - StripeBillingModule: Billing operations (checkout, portal, subscriptions)
 * - StripeCatalogModule: Catalog synchronization
 * - StripeAdminModule: Admin operations (reconciliation, monitoring)
 */
@Module({
  imports: [
    StripeWebhookModule,
    StripeBillingModule,
    StripeCatalogModule,
    StripeAdminModule,
  ],
  exports: [
    StripeWebhookModule,
    StripeBillingModule,
    StripeCatalogModule,
    StripeAdminModule,
  ],
})
export class StripeModule {}
