import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DatabaseModule } from '../../database/database.module';
import { PermissionsRepository } from '../../repositories/rbac/permissions.repository';
import { RolesRepository } from '../../repositories/rbac/roles.repository';
import { RbacService } from './rbac.service';

/**
 * RBAC Module - Global Module
 *
 * This module is marked as @Global() to make RBAC services and guards
 * available throughout the application without explicit imports.
 *
 * Why Global?
 * - RBAC is a cross-cutting concern like authentication
 * - PermissionsGuard is used in many modules
 * - Eliminates the need to import RbacModule in every feature module
 * - Follows NestJS best practices for authorization systems
 *
 * What's Exported:
 * - RbacService: Permission checking logic
 * - PermissionsGuard: Permission-based authorization guard
 * - RolesRepository: Role data access (for advanced use cases)
 * - PermissionsRepository: Permission data access (for advanced use cases)
 */
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    RbacService,
    RolesRepository,
    PermissionsRepository,
    PermissionsGuard,
  ],
  exports: [
    RbacService,
    RolesRepository,
    PermissionsRepository,
    PermissionsGuard,
  ],
})
export class RbacModule {}
