import { BaseRepository, DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  CreatePermissionInput,
  Permission,
} from './interfaces/permission.interface';

@Injectable()
export class TenantPermissionsRepository extends BaseRepository<
  Permission,
  CreatePermissionInput,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'tenant_permissions');
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
