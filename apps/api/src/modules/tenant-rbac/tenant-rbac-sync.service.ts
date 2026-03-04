import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ALL_TENANT_PERMISSIONS } from '../../common/constants/tenant-permissions.constant';
import { TENANT_SYSTEM_ROLE_PERMISSIONS } from '../../common/constants/tenant-system-roles.constant';
import { SystemTenantRole } from '../../common/types';
import { DatabaseService } from '../../database/database.service';

/**
 * RBAC Sync Service
 *
 * Syncs permissions and system roles from code constants to the database on app startup.
 * This ensures the database always reflects the current permission/role definitions in code.
 *
 * Sync Strategy:
 * - Permissions: Add new, update existing, delete removed
 * - System Roles: Add new, update existing, sync role-permission mappings
 * - Custom Roles: Never touched (tenant_id IS NOT NULL)
 *
 * Runs on every app startup via OnModuleInit (idempotent).
 */
@Injectable()
export class TenantRbacSyncService implements OnModuleInit {
  private readonly logger = new Logger(TenantRbacSyncService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.logger.log('Starting Tenant RBAC sync...');
    await this.syncPermissions();
    await this.syncSystemRoles();
    this.logger.log('Tenant RBAC sync completed successfully');
  }

  /**
   * Sync permissions from code constants to database
   * Strategy: Add new, update existing, delete removed
   */
  private async syncPermissions(): Promise<void> {
    await this.databaseService.transaction(async (client) => {
      // Parse permissions from ALL_TENANT_PERMISSIONS
      const permissionsToSync = this.parsePermissions();

      this.logger.log(
        `Syncing ${permissionsToSync.length} permissions to database...`,
      );

      // Upsert each permission
      for (const perm of permissionsToSync) {
        await client.query(
          `
          INSERT INTO public.tenant_permissions (key, name, resource, action, description)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (key) DO UPDATE SET
            name = EXCLUDED.name,
            resource = EXCLUDED.resource,
            action = EXCLUDED.action,
            description = EXCLUDED.description
        `,
          [perm.key, perm.name, perm.resource, perm.action, perm.description],
        );
      }

      // Delete permissions that exist in DB but not in code
      const permissionKeys = permissionsToSync.map((p) => p.key);

      // Safeguard: Never allow empty permissions array (likely a bug)
      if (permissionKeys.length === 0) {
        this.logger.error(
          'CRITICAL: ALL_TENANT_PERMISSIONS is empty! This is likely a bug. Aborting sync to prevent data loss.',
        );
        throw new Error(
          'Cannot sync permissions: ALL_TENANT_PERMISSIONS array is empty. This would delete all permissions from the database.',
        );
      }

      // Delete permissions that exist in DB but not in code
      const deleteResult = await client.query(
        `
          DELETE FROM public.tenant_permissions
          WHERE key NOT IN (${permissionKeys.map((_, i) => `$${i + 1}`).join(', ')})
          RETURNING key
        `,
        permissionKeys,
      );

      if (deleteResult.rowCount && deleteResult.rowCount > 0) {
        this.logger.warn(
          `Deleted ${deleteResult.rowCount} stale permissions: ${deleteResult.rows.map((r) => r.key).join(', ')}`,
        );
      }

      this.logger.log('Permissions synced successfully');
    }); // bypassRLS: true for system operations
  }

  /**
   * Sync system roles and their permission mappings
   * Strategy: Add new, update existing, sync role-permission mappings
   * Never touches custom tenant roles (tenant_id IS NOT NULL)
   */
  private async syncSystemRoles(): Promise<void> {
    await this.databaseService.transaction(async (client) => {
      const systemRoles = this.getSystemRolesData();

      this.logger.log(
        `Syncing ${systemRoles.length} system roles to database...`,
      );

      // Upsert each system role
      for (const role of systemRoles) {
        await client.query(
          `
          INSERT INTO public.tenant_roles (key, name, description, tenant_id, is_system, is_active)
          VALUES ($1, $2, $3, NULL, true, true)
          ON CONFLICT (key) WHERE tenant_id IS NULL DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_active = EXCLUDED.is_active
        `,
          [role.key, role.name, role.description],
        );
      }

      // Sync role-permission mappings for each system role
      for (const role of systemRoles) {
        // Get role ID
        const roleResult = await client.query(
          `SELECT id FROM public.tenant_roles WHERE key = $1 AND is_system = true`,
          [role.key],
        );

        if (roleResult.rows.length === 0) {
          this.logger.error(`System role not found: ${role.key}`);
          continue;
        }

        const roleId = roleResult.rows[0].id;

        // Get permission IDs for this role's permissions
        const permissionKeys = Array.from(role.permissions);

        // Delete existing mappings for this role first
        await client.query(
          `DELETE FROM public.tenant_role_permissions WHERE role_id = $1`,
          [roleId],
        );

        // Bug fix: Handle empty permissionKeys to avoid SQL syntax error
        if (permissionKeys.length === 0) {
          this.logger.log(
            `Role ${role.key} has no permissions - skipping permission mapping`,
          );
          continue;
        }

        // Get permission IDs for this role's permissions
        const permissionsResult = await client.query(
          `
          SELECT id, key FROM public.tenant_permissions
          WHERE key IN (${permissionKeys.map((_, i) => `$${i + 1}`).join(', ')})
        `,
          permissionKeys,
        );

        const permissionIds = permissionsResult.rows.map((r) => r.id);

        // Insert new mappings
        if (permissionIds.length > 0) {
          const values = permissionIds
            .map((permId, i) => `($1, $${i + 2})`)
            .join(', ');
          await client.query(
            `
            INSERT INTO public.tenant_role_permissions (role_id, permission_id)
            VALUES ${values}
            ON CONFLICT (role_id, permission_id) DO NOTHING
          `,
            [roleId, ...permissionIds],
          );
        }

        this.logger.log(
          `Synced ${permissionIds.length} permissions for role: ${role.key}`,
        );
      }

      this.logger.log('System roles synced successfully');
    }); // bypassRLS: true for system operations
  }

  /**
   * Parse permissions from ALL_TENANT_PERMISSIONS array
   * Extracts resource, action, and generates name/description
   */
  private parsePermissions(): Array<{
    key: string;
    name: string;
    resource: string;
    action: string;
    description: string;
  }> {
    return ALL_TENANT_PERMISSIONS.map((key) => {
      const [resource, action] = key.split(':');

      // Generate human-readable name and description
      const name = this.generatePermissionName(resource, action);
      const description = this.generatePermissionDescription(resource, action);

      return {
        key,
        name,
        resource,
        action,
        description,
      };
    });
  }

  /**
   * Generate human-readable permission name
   */
  private generatePermissionName(resource: string, action: string): string {
    const resourceName = this.capitalizeWords(resource);
    const actionName = this.capitalizeWords(action);

    if (action === '*') {
      return `All ${resourceName} Permissions`;
    }
    if (resource === '*') {
      return `${actionName} All Resources`;
    }

    return `${actionName} ${resourceName}`;
  }

  /**
   * Generate permission description
   */
  private generatePermissionDescription(
    resource: string,
    action: string,
  ): string {
    // Special cases for wildcards
    if (resource === '*' && action === '*') {
      return 'Full access to all tenant features (tenant_admin only)';
    }
    if (action === '*') {
      return `All permissions for ${resource}`;
    }
    if (resource === '*') {
      return `${this.capitalizeWords(action)} permission on all resources`;
    }

    // Concrete permissions - use predefined descriptions
    const descriptions: Record<string, string> = {
      'documents:create': 'Create new documents from templates',
      'documents:read': 'View and download documents',
      'documents:delete': 'Delete documents from repository',
      'contracts:analyze':
        'Perform AI-powered contract analysis and risk assessment',
      'contracts:redline': 'AI-assisted contract redlining and editing',
      'templates:manage': 'Create, edit, and manage document templates',
      'templates:use': 'Use approved templates to generate documents',
      'regulatory:query': 'Access and query regulatory information',
      'billing:manage': 'Manage subscription, invoices, and payment methods',
      'team:manage': 'Invite, remove, and manage team members',
      'settings:manage': 'Manage tenant configuration and settings',
      'settings:change_jurisdiction':
        'Change tenant jurisdiction (critical - affects legal logic)',
    };

    return (
      descriptions[`${resource}:${action}`] ||
      `${this.capitalizeWords(action)} ${resource}`
    );
  }

  /**
   * Get system roles data with their permissions
   */
  private getSystemRolesData(): Array<{
    key: string;
    name: string;
    description: string;
    permissions: ReadonlySet<string>;
  }> {
    return [
      {
        key: SystemTenantRole.TENANT_ADMIN,
        name: 'Tenant Admin',
        description:
          'Full access to all features including billing, team management, and jurisdiction settings',
        permissions:
          TENANT_SYSTEM_ROLE_PERMISSIONS[SystemTenantRole.TENANT_ADMIN],
      },
      {
        key: SystemTenantRole.LEGAL_COUNSEL,
        name: 'Legal Counsel',
        description:
          'Full AI drafting, risk analysis, redlining, and template management',
        permissions:
          TENANT_SYSTEM_ROLE_PERMISSIONS[SystemTenantRole.LEGAL_COUNSEL],
      },
      {
        key: SystemTenantRole.MEMBER,
        name: 'Member',
        description:
          'Use approved wizards and generate documents from approved templates',
        permissions: TENANT_SYSTEM_ROLE_PERMISSIONS[SystemTenantRole.MEMBER],
      },
      {
        key: SystemTenantRole.VIEWER,
        name: 'Viewer',
        description: 'Read-only access to document repository',
        permissions: TENANT_SYSTEM_ROLE_PERMISSIONS[SystemTenantRole.VIEWER],
      },
    ];
  }

  /**
   * Capitalize words in a string (e.g., "documents" -> "Documents")
   */
  private capitalizeWords(str: string): string {
    return str
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
