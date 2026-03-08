import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stripeConfig from 'src/config/stripe.config';
import { DatabaseModule } from 'src/database/database.module';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { StripeAdminController } from './controllers/stripe-admin.controller';
import { StripeCheckoutController } from './controllers/stripe-checkout.controller';
import { StripeBillingPortalService } from './services/stripe-billing-portal.service';
import { StripeCatalogSyncService } from './services/stripe-catalog-sync.service';
import { StripeCheckoutService } from './services/stripe-checkout.service';
import { StripeCustomerService } from './services/stripe-customer.service';
import { StripeTaxService } from './services/stripe-tax.service';
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
    StripeCheckoutController,
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
    TenantRepository,
    UserTenantRepository,
  ],
  exports: [StripeService, StripeCustomerService, StripeTaxService],
})
export class StripeModule {}
