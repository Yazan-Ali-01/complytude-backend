import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import {
  CreatePermissionInput,
  Permission,
} from './interfaces/permission.interface';

@Injectable()
export class PermissionsRepository extends BaseRepository<
  Permission,
  CreatePermissionInput,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'permissions');
  }

  protected mapRow(row: Record<string, unknown>): Permission {
    return {
      id: row.id as string,
      key: row.key as string,
      name: row.name as string,
      resource: row.resource as string,
      action: row.action as string,
      description: (row.description as string) || null,
      createdAt: row.created_at as Date,
    };
  }

  protected getSelectColumns(): string {
    return 'id, key, name, resource, action, description, created_at';
  }

  /**
   * Find a permission by its key
   * @param key - Permission key (e.g., 'documents:create')
   */
  async findByKey(key: string): Promise<Permission | null> {
    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      WHERE key = $1
      LIMIT 1
    `;

    const result = await this.executeQuery(query, [key]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get all permissions for a role by role key
   * @param roleKey - Role key (e.g., 'tenant_admin')
   */
  async findByRoleKey(roleKey: string): Promise<Permission[]> {
    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName} p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      INNER JOIN roles r ON rp.role_id = r.id
      WHERE r.key = $1
        AND r.is_system = true
        AND r.is_active = true
      ORDER BY p.key
    `;

    const result = await this.executeQuery(query, [roleKey]);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Check if a role has a specific permission
   * @param roleKey - Role key (e.g., 'tenant_admin')
   * @param permissionKey - Permission key (e.g., 'documents:create')
   */
  async checkRoleHasPermission(
    roleKey: string,
    permissionKey: string,
  ): Promise<boolean> {
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM permissions p
        INNER JOIN role_permissions rp ON p.id = rp.permission_id
        INNER JOIN roles r ON rp.role_id = r.id
        WHERE r.key = $1
          AND p.key = $2
          AND r.is_system = true
          AND r.is_active = true
      ) as has_permission
    `;

    const result = await this.executeQuery(query, [roleKey, permissionKey]);
    return result.rows[0]?.has_permission === true;
  }

  /**
   * Get all permissions grouped by resource
   */
  async findAllGroupedByResource(): Promise<Record<string, Permission[]>> {
    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      ORDER BY resource, action
    `;

    const result = await this.executeQuery(query);
    const permissions = result.rows.map((row) => this.mapRow(row));

    return permissions.reduce(
      (acc, permission) => {
        if (!acc[permission.resource]) {
          acc[permission.resource] = [];
        }
        acc[permission.resource].push(permission);
        return acc;
      },
      {} as Record<string, Permission[]>,
    );
  }
}
