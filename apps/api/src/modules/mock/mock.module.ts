import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { RbacMockController } from './rbac-mock.controller';

/**
 * Mock Module
 *
 * This module contains mock controllers for testing and demonstrating new features.
 * Use this module to:
 * - Test RBAC permissions before implementing real features
 * - Demonstrate API patterns to frontend developers
 * - Validate authentication and authorization flows
 * - Test audit logging
 */
@Module({
  imports: [RbacModule],
  controllers: [RbacMockController],
})
export class MockModule {}
