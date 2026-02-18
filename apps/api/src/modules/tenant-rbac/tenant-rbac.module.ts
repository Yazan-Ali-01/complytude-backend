import { Global, Module } from '@nestjs/common';
import { TenantPermissionsGuard } from '../../common/guards/tenant-permissions.guard';
import { DatabaseModule } from '../../database/database.module';
import { PermissionsRepository } from '../../repositories/rbac/permissions.repository';
import { RolesRepository } from '../../repositories/rbac/roles.repository';
import { TenantRbacSyncService } from './tenant-rbac-sync.service';
import { TenantRbacService } from './tenant-rbac.service';

/**
 * TenantRBAC Module - Global Module
 *
 * This module is marked as @Global() to make TenantRBAC services and guards
 * available throughout the tenant application without explicit imports.
 *
 * Why Global?
 * - TenantRBAC is a cross-cutting concern like authentication
 * - PermissionsGuard is used in many modules
 * - Eliminates the need to import TenantRbacModule in every feature module
 * - Follows NestJS best practices for authorization systems
 *
 * What's Exported:
 * - TenantRbacService: Permission checking logic
 * - PermissionsGuard: Permission-based authorization guard
 * - RolesRepository: Role data access (for advanced use cases)
 * - PermissionsRepository: Permission data access (for advanced use cases)
 *
 * Sync Service:
 * - TenantRbacSyncService: Syncs permissions and system roles on app startup
 * - Runs via OnModuleInit (not exported, internal only)
 */
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    TenantRbacService,
    TenantRbacSyncService,
    RolesRepository,
    PermissionsRepository,
    TenantPermissionsGuard,
  ],
  exports: [
    TenantRbacService,
    RolesRepository,
    PermissionsRepository,
    TenantPermissionsGuard,
  ],
})
export class TenantRbacModule {}
