import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CreditsMockController } from './credits-mock.controller';
import { DomainEventsMockController } from './domain-events-mock.controller';
import { EnforcementMockController } from './enforcement-mock.controller';
import { EntitlementsMockController } from './entitlements-mock.controller';
import { QueueTestMockController } from './queue-test-mock.controller';
import { RbacMockController } from './rbac-mock.controller';
import { SnapshotMockController } from './snapshot-mock.controller';
import { StorageService } from './storage-mock.service';
import { UsageMockController } from './usage-mock.controller';

/**
 * Mock Module
 *
 * This module contains mock controllers for testing and demonstrating new features.
 * Use this module to:
 * - Test RBAC permissions before implementing real features
 * - Test entitlement resolution and enforcement
 * - Test usage tracking and projection (Phase 3)
 * - Test credit ledger and enforcement (Phase 4)
 * - Test guard-level enforcement (Phase 5)
 * - Test subscription management (Phase 6)
 * - Test domain event system (Phase 7)
 * - Test entitlement snapshots (Phase 8)
 * - Demonstrate API patterns to frontend developers
 * - Validate authentication and authorization flows
 * - Test audit logging
 */
@Module({
  controllers: [
    RbacMockController,
    EntitlementsMockController,
    UsageMockController,
    CreditsMockController,
    EnforcementMockController,
    DomainEventsMockController,
    SnapshotMockController,
    QueueTestMockController,
  ],
  providers: [StorageService],
  exports: [StorageService],
  imports: [SubscriptionsModule, DatabaseModule],
})
export class MockModule {}
