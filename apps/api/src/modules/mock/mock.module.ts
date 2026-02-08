import { Module } from '@nestjs/common';
import { RbacMockController } from './rbac-mock.controller';
import { EntitlementsMockController } from './entitlements-mock.controller';

/**
 * Mock Module
 *
 * This module contains mock controllers for testing and demonstrating new features.
 * Use this module to:
 * - Test RBAC permissions before implementing real features
 * - Test entitlement resolution and enforcement
 * - Demonstrate API patterns to frontend developers
 * - Validate authentication and authorization flows
 * - Test audit logging
 */
@Module({
  controllers: [RbacMockController, EntitlementsMockController],
})
export class MockModule {}
