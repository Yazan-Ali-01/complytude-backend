import { DatabaseService } from '@lib/database';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ALL_PLATFORM_PERMISSIONS } from '../../common/constants/platform-permissions.constant';
import { PLATFORM_SYSTEM_ROLE_PERMISSIONS } from '../../common/constants/platform-system-roles.constant';
import { SystemPlatformRole } from '../../common/types';

/**
 * Platform RBAC Sync Service
 *
 * Syncs platform permissions and system roles from code constants to the database on app startup.
 * Mirrors TenantRbacSyncService pattern for platform-level RBAC.
 *
 * Sync Strategy:
 * - Permissions: Add new, update existing, delete removed
 * - System Roles: Add new, update existing, sync role-permission mappings
 * - Custom Roles: Never touched (is_system = false)
 */
@Injectable()
export class PlatformRbacSyncService implements OnModuleInit {
  private readonly logger = new Logger(PlatformRbacSyncService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.logger.log('Starting platform RBAC sync...');
    await this.syncPermissions();
    await this.syncSystemRoles();
    this.logger.log('Platform RBAC sync completed successfully');
  }

  private async syncPermissions(): Promise<void> {
    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const permissionsToSync = this.parsePermissions();

        this.logger.log(
          `Syncing ${permissionsToSync.length} platform permissions to database...`,
        );

        for (const perm of permissionsToSync) {
          await client.query(
            `
          INSERT INTO public.platform_permissions (key, name, resource, action, description)
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

        const permissionKeys = permissionsToSync.map((p) => p.key);

        if (permissionKeys.length === 0) {
          this.logger.error(
            'CRITICAL: ALL_PLATFORM_PERMISSIONS is empty! Aborting sync.',
          );
          throw new Error('Cannot sync platform permissions: array is empty.');
        }

        const deleteResult = await client.query(
          `
          DELETE FROM public.platform_permissions
          WHERE key NOT IN (${permissionKeys.map((_, i) => `$${i + 1}`).join(', ')})
          RETURNING key
        `,
          permissionKeys,
        );

        if (deleteResult.rowCount && deleteResult.rowCount > 0) {
          this.logger.warn(
            `Deleted ${deleteResult.rowCount} stale platform permissions`,
          );
        }

        this.logger.log('Platform permissions synced successfully');
      },
    );
  }

  private async syncSystemRoles(): Promise<void> {
    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const systemRoles = this.getSystemRolesData();

        this.logger.log(
          `Syncing ${systemRoles.length} platform system roles to database...`,
        );

        for (const role of systemRoles) {
          await client.query(
            `
          INSERT INTO public.platform_roles (key, name, description, is_system, is_active)
          VALUES ($1, $2, $3, true, true)
          ON CONFLICT (key) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_active = EXCLUDED.is_active
        `,
            [role.key, role.name, role.description],
          );
        }

        for (const role of systemRoles) {
          const roleResult = await client.query(
            `SELECT id FROM public.platform_roles WHERE key = $1 AND is_system = true`,
            [role.key],
          );

          if (roleResult.rows.length === 0) {
            this.logger.error(`Platform system role not found: ${role.key}`);
            continue;
          }

          const roleId = roleResult.rows[0].id;
          const permissionKeys = Array.from(role.permissions);

          await client.query(
            `DELETE FROM public.platform_role_permissions WHERE role_id = $1`,
            [roleId],
          );

          if (permissionKeys.length === 0) {
            continue;
          }

          const permissionsResult = await client.query(
            `
          SELECT id, key FROM public.platform_permissions
          WHERE key IN (${permissionKeys.map((_, i) => `$${i + 1}`).join(', ')})
        `,
            permissionKeys,
          );

          const permissionIds = permissionsResult.rows.map((r) => r.id);

          if (permissionIds.length > 0) {
            const values = permissionIds
              .map((permId, i) => `($1, $${i + 2})`)
              .join(', ');
            await client.query(
              `
            INSERT INTO public.platform_role_permissions (role_id, permission_id)
            VALUES ${values}
            ON CONFLICT (role_id, permission_id) DO NOTHING
          `,
              [roleId, ...permissionIds],
            );
          }
        }

        this.logger.log('Platform system roles synced successfully');
      },
    );
  }

  private parsePermissions(): Array<{
    key: string;
    name: string;
    resource: string;
    action: string;
    description: string;
  }> {
    return ALL_PLATFORM_PERMISSIONS.map((key) => {
      const [resource, action] = key.split(':');
      const name = this.generatePermissionName(resource, action);
      const description = this.generatePermissionDescription(resource, action);
      return { key, name, resource, action, description };
    });
  }

  private generatePermissionName(resource: string, action: string): string {
    const resourceName = this.capitalizeWords(resource);
    const actionName = this.capitalizeWords(action);
    if (action === '*') return `All ${resourceName} Permissions`;
    if (resource === '*') return `${actionName} All Resources`;
    return `${actionName} ${resourceName}`;
  }

  private generatePermissionDescription(
    resource: string,
    action: string,
  ): string {
    if (resource === '*' && action === '*') {
      return 'Full access to all platform features (system_admin only)';
    }
    if (action === '*') return `All permissions for ${resource}`;
    if (resource === '*') {
      return `${this.capitalizeWords(action)} permission on all resources`;
    }
    return `${this.capitalizeWords(action)} ${resource}`;
  }

  private getSystemRolesData(): Array<{
    key: string;
    name: string;
    description: string;
    permissions: ReadonlySet<string>;
  }> {
    return [
      {
        key: SystemPlatformRole.SYSTEM_ADMIN,
        name: 'System Admin',
        description: 'Full access to all platform features',
        permissions:
          PLATFORM_SYSTEM_ROLE_PERMISSIONS[SystemPlatformRole.SYSTEM_ADMIN],
      },
      {
        key: SystemPlatformRole.SUPPORT,
        name: 'Support',
        description: 'Read-only access for customer support',
        permissions:
          PLATFORM_SYSTEM_ROLE_PERMISSIONS[SystemPlatformRole.SUPPORT],
      },
      {
        key: SystemPlatformRole.AUDITOR,
        name: 'Auditor',
        description: 'Audit and compliance read-only access',
        permissions:
          PLATFORM_SYSTEM_ROLE_PERMISSIONS[SystemPlatformRole.AUDITOR],
      },
    ];
  }

  private capitalizeWords(str: string): string {
    return str
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
