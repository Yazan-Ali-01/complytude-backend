import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  TenantRole,
  PermissionKey,
  PermissionCheckLog,
} from './types/rbac.types';
import { PERMISSION_MATRIX } from './config/permissions.config';

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);
  private permissionCache: Map<TenantRole, Set<PermissionKey>> = new Map();

  constructor(private readonly databaseService: DatabaseService) {}

  onModuleInit() {
    this.loadPermissionsCache();
    this.logger.log('RBAC Permissions cache loaded');
  }

  private loadPermissionsCache() {
    for (const role of Object.keys(PERMISSION_MATRIX) as TenantRole[]) {
      this.permissionCache.set(role, new Set(PERMISSION_MATRIX[role]));
    }
  }

  hasPermission(role: string, permission: PermissionKey): boolean {
    const permissions = this.permissionCache.get(role as TenantRole);
    return permissions ? permissions.has(permission) : false;
  }

  getPermissionsForRole(role: TenantRole): PermissionKey[] {
    return Array.from(this.permissionCache.get(role) || []);
  }

  checkPermissions(role: string, required: PermissionKey[]): boolean {
    return required.every((permission) => this.hasPermission(role, permission));
  }

  async logPermissionCheck(log: PermissionCheckLog): Promise<void> {
    try {
      await this.databaseService.query(
        `INSERT INTO public.rbac_audit_log 
         (user_id, tenant_id, role, action, resource_type, resource_id, granted, ai_model_used, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          log.userId,
          log.tenantId,
          log.role,
          log.action,
          log.resourceType || null,
          log.resourceId || null,
          log.granted,
          log.aiModelUsed || null,
          log.metadata ? JSON.stringify(log.metadata) : null,
        ],
        false,
      );
    } catch (error) {
      this.logger.error(
        `Failed to log permission check for user ${log.userId}`,
        error,
      );
    }
  }

  refreshCache(): void {
    this.permissionCache.clear();
    this.loadPermissionsCache();
    this.logger.log('RBAC Permissions cache refreshed');
  }
}
