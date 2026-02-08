import { Module } from '@nestjs/common';
import { RbacMockController } from './rbac-mock.controller';
import { EntitlementsMockController } from './entitlements-mock.controller';
import { UsageMockController } from './usage-mock.controller';

/**
 * Mock Module
 *
 * This module contains mock controllers for testing and demonstrating new features.
 * Use this module to:
 * - Test RBAC permissions before implementing real features
 * - Test entitlement resolution and enforcement
 * - Test usage tracking and projection (Phase 3)
 * - Demonstrate API patterns to frontend developers
 * - Validate authentication and authorization flows
 * - Test audit logging
 */
@Module({
  controllers: [
    RbacMockController,
    EntitlementsMockController,
    UsageMockController,
  ],
})
export class MockModule {}
