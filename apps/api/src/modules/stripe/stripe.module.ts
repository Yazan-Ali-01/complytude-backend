import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stripeConfig from 'src/config/stripe.config';
import { StripeService } from './stripe.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(stripeConfig)],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
