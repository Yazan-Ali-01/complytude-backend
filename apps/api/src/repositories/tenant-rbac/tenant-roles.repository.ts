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
   * Find a role by its key
   * @param key - Role key (e.g., 'tenant_admin', 'legal_counsel')
   * @param tenantId - Optional tenant ID for custom roles
   */
  async findByKey(key: string, tenantId?: string): Promise<Role | null> {
    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      WHERE key = $1
        AND (tenant_id = $2 OR (tenant_id IS NULL AND $2 IS NULL))
      LIMIT 1
    `;

    const result = await this.executeQuery(query, [key, tenantId || null]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get all system (base) roles
   */
  async findSystemRoles(): Promise<Role[]> {
    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      WHERE is_system = true
        AND is_active = true
      ORDER BY key
    `;

    const result = await this.executeQuery(query);
    return result.rows.map((row) => this.mapRow(row));
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

    const result = await this.executeQuery(query, [roleKey, tenantId]);
    return result.rows.map((row) => row.key as string);
  }

  /**
   * Find roles by tenant ID (for custom roles - MVP+)
   * @param tenantId - Tenant ID
   */
  async findByTenantId(tenantId: string): Promise<Role[]> {
    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      WHERE tenant_id = $1
        AND is_active = true
      ORDER BY name
    `;

    const result = await this.executeQuery(query, [tenantId]);
    return result.rows.map((row) => this.mapRow(row));
  }
}
