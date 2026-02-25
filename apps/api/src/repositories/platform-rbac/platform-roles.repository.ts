import { BaseRepository } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreatePlatformRoleInput,
  PlatformRole,
  UpdatePlatformRoleInput,
} from './interfaces/platform-role.interface';

@Injectable()
export class PlatformRolesRepository extends BaseRepository<
  PlatformRole,
  CreatePlatformRoleInput,
  UpdatePlatformRoleInput
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'platform_roles');
  }

  protected mapRow(row: Record<string, unknown>): PlatformRole {
    return {
      id: row.id as string,
      key: row.key as string,
      name: row.name as string,
      description: (row.description as string) || null,
      isSystem: row.is_system as boolean,
      isActive: row.is_active as boolean,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  protected getSelectColumns(): string {
    return 'id, key, name, description, is_system, is_active, created_at, updated_at';
  }

  async findByKey(key: string): Promise<PlatformRole | null> {
    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      WHERE key = $1
      LIMIT 1
    `;
    const result = await this.executeQuery(query, [key]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findSystemRoles(): Promise<PlatformRole[]> {
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
   * Get permissions for a custom platform role (future)
   * System roles use in-memory lookup, not this method.
   */
  async getPermissionsForRole(roleKey: string): Promise<string[]> {
    const query = `
      SELECT p.key
      FROM platform_permissions p
      INNER JOIN platform_role_permissions rp ON p.id = rp.permission_id
      INNER JOIN platform_roles r ON rp.role_id = r.id
      WHERE r.key = $1
        AND r.is_active = true
      ORDER BY p.key
    `;
    const result = await this.executeQuery(query, [roleKey]);
    return result.rows.map((row) => row.key as string);
  }
}
