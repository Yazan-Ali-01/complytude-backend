import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stripeConfig from 'src/config/stripe.config';
import { DatabaseModule } from 'src/database/database.module';
import { CreditPackagesRepository } from 'src/repositories/credits/credit-packages.repository';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { SubscriptionsModule } from '../../subscriptions/subscriptions.module';
import { StripeService } from '../stripe.service';
import { BillingController } from '../controllers/billing.controller';
import { StripeCustomerService } from '../services/stripe-customer.service';
import { StripeCheckoutService } from '../services/stripe-checkout.service';
import { StripeBillingPortalService } from '../services/stripe-billing-portal.service';
import { StripeTaxService } from '../services/stripe-tax.service';
import { StripeSubscriptionService } from '../services/stripe-subscription.service';
import { StripeAddonService } from '../services/stripe-addon.service';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(stripeConfig),
    DatabaseModule,
    SubscriptionsModule,
  ],
  controllers: [BillingController],
  providers: [
    StripeService,
    StripeCustomerService,
    StripeCheckoutService,
    StripeBillingPortalService,
    StripeTaxService,
    StripeSubscriptionService,
    StripeAddonService,
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
  ],
})
export class StripeBillingModule {}
