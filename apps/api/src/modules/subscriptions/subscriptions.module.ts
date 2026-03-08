import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Subscriptions Module
 *
 * Thin internal module that owns the Navigator (free) subscription lifecycle.
 * All paid subscription mutations go through StripeModule/StripeSubscriptionService.
 *
 * Exports:
 * - SubscriptionsService: Read access + Navigator lifecycle (renewal, creation)
 *
 * Dependencies:
 * - DatabaseModule: For database access
 * - EntitlementsModule (global): For repositories and domain events
 */
@Module({
  imports: [DatabaseModule],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
