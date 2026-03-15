import { Module } from '@nestjs/common';
import { StripeCustomerService } from './services/stripe-customer.service';

@Module({
  providers: [StripeCustomerService],
  exports: [StripeCustomerService],
})
export class StripeModule {}
