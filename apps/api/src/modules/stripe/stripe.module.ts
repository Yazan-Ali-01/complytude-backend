import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stripeConfig from 'src/config/stripe.config';
import { DatabaseModule } from 'src/database/database.module';
import { CreditPackagesRepository } from 'src/repositories/credits/credit-packages.repository';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { StripeAdminController } from './controllers/stripe-admin.controller';
import { BillingController } from './controllers/billing.controller';
import { StripeAddonService } from './services/stripe-addon.service';
import { StripeBillingPortalService } from './services/stripe-billing-portal.service';
import { StripeCatalogSyncService } from './services/stripe-catalog-sync.service';
import { StripeCheckoutService } from './services/stripe-checkout.service';
import { StripeCustomerService } from './services/stripe-customer.service';
import { StripeReconciliationService } from './services/stripe-reconciliation.service';
import { StripeSubscriptionService } from './services/stripe-subscription.service';
import { StripeTaxService } from './services/stripe-tax.service';
import { StripeWebhookMonitoringService } from './services/stripe-webhook-monitoring.service';
import { StripeService } from './stripe.service';
import { StripeEventHandlersService } from './webhook/stripe-event-handlers';
import { StripeWebhookController } from './webhook/stripe-webhook.controller';
import { StripeWebhookService } from './webhook/stripe-webhook.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(stripeConfig), DatabaseModule],
  controllers: [
    StripeWebhookController,
    StripeAdminController,
    BillingController,
  ],
  providers: [
    StripeService,
    StripeWebhookService,
    StripeWebhookEventsRepository,
    StripeEventHandlersService,
    StripeCatalogSyncService,
    StripeCustomerService,
    StripeCheckoutService,
    StripeBillingPortalService,
    StripeTaxService,
    StripeSubscriptionService,
    StripeAddonService,
    StripeReconciliationService,
    StripeWebhookMonitoringService,
    SubscriptionsService,
    TenantRepository,
    UserTenantRepository,
    CreditPackagesRepository,
  ],
  exports: [
    StripeService,
    StripeCustomerService,
    StripeTaxService,
    StripeSubscriptionService,
    StripeAddonService,
    SubscriptionsService,
  ],
})
export class StripeModule {}
