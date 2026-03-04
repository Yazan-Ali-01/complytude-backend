import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Subscriptions Module - Phase 6
 *
 * Manages tenant subscriptions: plan changes, cancellations, and billing periods.
 *
 * This module is NOT global (unlike EntitlementsModule) -- it's imported where needed.
 *
 * Providers:
 * - SubscriptionsService: Business logic for subscription management
 *
 * Controllers:
 * - SubscriptionsController: HTTP endpoints for subscription operations
 *
 * Exports:
 * - SubscriptionsService: For use in other modules (e.g., admin, billing)
 *
 * Dependencies:
 * - DatabaseModule: For database access
 * - EntitlementsModule (global): For snapshot invalidation, domain events, repositories
 */
@Module({
  imports: [],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
