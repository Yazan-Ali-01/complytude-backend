import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { RolePermission } from '../entities/role-permission.entity';
import { Permission } from '../entities/permission.entity';
import { QueryOptions } from '../../../repositories/base/repository.interface';

@Injectable()
export class RolePermissionsRepository {
  private readonly logger = new Logger(RolePermissionsRepository.name);
  private readonly tableName = 'public.role_permissions';

  constructor(private readonly databaseService: DatabaseService) {}

  private mapRow(row: Record<string, unknown>): RolePermission {
    return {
      role_name: row.role_name as string,
      permission_id: row.permission_id as string,
      granted_at: new Date(row.granted_at as string),
    };
  }

  private mapPermissionRow(row: Record<string, unknown>): Permission {
    return {
      id: row.id as string,
      name: row.name as string,
      resource: row.resource as string,
      action: row.action as string,
      description: row.description as string | null,
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
    };
  }

  async getPermissionsForRole(roleName: string): Promise<Permission[]> {
    this.logger.debug(
      `getPermissionsForRole: table=${this.tableName}, role=${roleName}`,
    );
    const result = await this.databaseService.query(
      `SELECT p.id, p.name, p.resource, p.action, p.description, p.created_at, p.updated_at
       FROM ${this.tableName} rp
       JOIN public.permissions p ON p.id = rp.permission_id
       WHERE rp.role_name = $1
       ORDER BY p.resource, p.action`,
      [roleName],
      true,
    );
    return (result.rows as Record<string, unknown>[]).map((row) =>
      this.mapPermissionRow(row),
    );
  }

  async getRolesWithPermission(permissionName: string): Promise<string[]> {
    this.logger.debug(
      `getRolesWithPermission: table=${this.tableName}, permission=${permissionName}`,
    );
    const result = await this.databaseService.query(
      `SELECT rp.role_name
       FROM ${this.tableName} rp
       JOIN public.permissions p ON p.id = rp.permission_id
       WHERE p.name = $1`,
      [permissionName],
      true,
    );
    return result.rows.map((row) => row.role_name as string);
  }

  async findByRoleAndPermission(
    roleName: string,
    permissionId: string,
  ): Promise<RolePermission | null> {
    this.logger.debug(
      `findByRoleAndPermission: table=${this.tableName}, role=${roleName}, permission=${permissionId}`,
    );
    const result = await this.databaseService.query(
      `SELECT * FROM ${this.tableName} WHERE role_name = $1 AND permission_id = $2`,
      [roleName, permissionId],
      true,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  async assignPermission(
    roleName: string,
    permissionId: string,
    _options?: QueryOptions,
  ): Promise<RolePermission> {
    this.logger.debug(
      `assignPermission: table=${this.tableName}, role=${roleName}, permission=${permissionId}`,
    );
    const result = await this.databaseService.query(
      `INSERT INTO ${this.tableName} (role_name, permission_id)
       VALUES ($1, $2)
       ON CONFLICT (role_name, permission_id) DO UPDATE SET granted_at = NOW()
       RETURNING *`,
      [roleName, permissionId],
      true,
    );
    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  async removePermission(
    roleName: string,
    permissionId: string,
    _options?: QueryOptions,
  ): Promise<boolean> {
    this.logger.debug(
      `removePermission: table=${this.tableName}, role=${roleName}, permission=${permissionId}`,
    );
    const result = await this.databaseService.query(
      `DELETE FROM ${this.tableName} WHERE role_name = $1 AND permission_id = $2`,
      [roleName, permissionId],
      true,
    );
    return (result.rowCount ?? 0) > 0;
  }

  async removeAllPermissionsForRole(
    roleName: string,
    _options?: QueryOptions,
  ): Promise<number> {
    this.logger.debug(
      `removeAllPermissionsForRole: table=${this.tableName}, role=${roleName}`,
    );
    const result = await this.databaseService.query(
      `DELETE FROM ${this.tableName} WHERE role_name = $1`,
      [roleName],
      true,
    );
    return result.rowCount ?? 0;
  }

  async getPermissionCountForRole(roleName: string): Promise<number> {
    this.logger.debug(
      `getPermissionCountForRole: table=${this.tableName}, role=${roleName}`,
    );
    const result = await this.databaseService.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE role_name = $1`,
      [roleName],
      true,
    );
    return parseInt(result.rows[0]?.count as string, 10);
  }
}
