import { BaseRepository, DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  CreateRoleInput,
  Role,
  UpdateRoleInput,
} from './interfaces/role.interface';

@Injectable()
export class TenantRolesRepository extends BaseRepository<
  Role,
  CreateRoleInput,
  UpdateRoleInput
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'tenant_roles');
  }

  protected mapRow(row: Record<string, unknown>): Role {
    return {
      id: row.id as string,
      key: row.key as string,
      name: row.name as string,
      description: (row.description as string) || null,
      tenantId: (row.tenant_id as string) || null,
      isSystem: row.is_system as boolean,
      isActive: row.is_active as boolean,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  protected getSelectColumns(): string {
    return 'id, key, name, description, tenant_id, is_system, is_active, created_at, updated_at';
  }

  /**
   * Get all permission keys for a role
   * Supports both system roles and custom tenant roles
   *
   * NOTE: This method should only be called for custom roles (MVP+)
   * System roles are handled in-memory via TENANT_SYSTEM_ROLE_PERMISSIONS
   * and should never reach this database query.
   *
   * @param roleKey - Role key (e.g., 'custom_role_key')
   * @param tenantId - Tenant ID for custom roles
   * @returns Array of permission keys (concrete only, no wildcards from DB)
   *
   * Database only stores concrete permissions (e.g., 'documents:read')
   * Wildcards (e.g., 'documents:*') exist only in code for system roles
   */
  async getPermissionsForRole(
    roleKey: string,
    tenantId: string,
  ): Promise<string[]> {
    const query = `
      SELECT p.key
      FROM tenant_permissions p
      INNER JOIN tenant_role_permissions rp ON p.id = rp.permission_id
      INNER JOIN tenant_roles r ON rp.role_id = r.id
      WHERE r.key = $1
        AND r.is_active = true
        AND r.tenant_id = $2
      ORDER BY p.key
    `;

    // A custom role is visible only in its tenant's context (RLS)
    const result = await this.executeQuery(query, [roleKey, tenantId], {
      tenant: { tenantId, schema: 'public' },
    });
    return result.rows.map((row) => row.key as string);
  }
}
