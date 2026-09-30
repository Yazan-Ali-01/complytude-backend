import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Subscriptions Module
 *
 * Thin internal module that owns the Navigator (free) subscription lifecycle.
 * All paid subscription mutations go through StripeModule/StripeSubscriptionService.
 *
 * Exports:
 * - SubscriptionsService: Read access + Navigator lifecycle (creation, trials, renewal)
 *
 * Dependencies:
 * - DatabaseModule: For database access
 * - EntitlementsModule: For PlansRepository, EntitlementSnapshotsRepository, DomainEventsService
 */
@Module({
  imports: [EntitlementsModule],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
