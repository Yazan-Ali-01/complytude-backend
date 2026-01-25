import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@complytude/shared';
import {
  Permission,
  CreatePermissionRow,
  UpdatePermissionRow,
} from '../entities/permission.entity';
import { QueryOptions } from '@complytude/shared';

@Injectable()
export class PermissionsRepository {
  private readonly logger = new Logger(PermissionsRepository.name);
  private readonly tableName = 'public.permissions';

  constructor(private readonly databaseService: DatabaseService) {}

  private mapRow(row: Record<string, unknown>): Permission {
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

  private getSelectColumns(): string {
    return 'id, name, resource, action, description, created_at, updated_at';
  }

  async findAll(__options?: QueryOptions): Promise<Permission[]> {
    this.logger.debug(`findAll: table=${this.tableName}`);
    const result = await this.databaseService.query(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} ORDER BY resource, action`,
      [],
      true,
    );
    return (result.rows as Record<string, unknown>[]).map((row) =>
      this.mapRow(row),
    );
  }

  async findById(
    id: string,
    __options?: QueryOptions,
  ): Promise<Permission | null> {
    this.logger.debug(`findById: table=${this.tableName}, id=${id}`);
    const result = await this.databaseService.query(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE id = $1`,
      [id],
      true,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  async findByName(
    name: string,
    _options?: QueryOptions,
  ): Promise<Permission | null> {
    this.logger.debug(`findByName: table=${this.tableName}, name=${name}`);
    const result = await this.databaseService.query(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE name = $1`,
      [name],
      true,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  async findByResource(
    resource: string,
    _options?: QueryOptions,
  ): Promise<Permission[]> {
    this.logger.debug(
      `findByResource: table=${this.tableName}, resource=${resource}`,
    );
    const result = await this.databaseService.query(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE resource = $1 ORDER BY action`,
      [resource],
      true,
    );
    return (result.rows as Record<string, unknown>[]).map((row) =>
      this.mapRow(row),
    );
  }

  async findByNames(
    names: string[],
    _options?: QueryOptions,
  ): Promise<Permission[]> {
    if (names.length === 0) return [];
    this.logger.debug(
      `findByNames: table=${this.tableName}, count=${names.length}`,
    );
    const placeholders = names.map((_, idx) => `$${idx + 1}`).join(', ');
    const result = await this.databaseService.query(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE name IN (${placeholders})`,
      names,
      true,
    );
    return (result.rows as Record<string, unknown>[]).map((row) =>
      this.mapRow(row),
    );
  }

  async create(
    data: CreatePermissionRow,
    _options?: QueryOptions,
  ): Promise<Permission> {
    this.logger.debug(`create: table=${this.tableName}, name=${data.name}`);
    const { name, resource, action, description } = data;
    const result = await this.databaseService.query(
      `INSERT INTO ${this.tableName} (name, resource, action, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, resource, action, description],
      true,
    );
    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  async update(
    id: string,
    data: UpdatePermissionRow,
    _options?: QueryOptions,
  ): Promise<Permission | null> {
    this.logger.debug(`update: table=${this.tableName}, id=${id}`);
    const entries = Object.entries(data).filter(
      ([, value]) => value !== undefined,
    );
    if (entries.length === 0) return this.findById(id);

    const setClause = entries
      .map(([key], idx) => `${key} = $${idx + 2}`)
      .join(', ');
    const values = entries.map(([, value]) => value);

    const result = await this.databaseService.query(
      `UPDATE ${this.tableName}
       SET ${setClause}
       WHERE id = $1
       RETURNING *`,
      [id, ...values],
      true,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  async delete(id: string, _options?: QueryOptions): Promise<boolean> {
    this.logger.debug(`delete: table=${this.tableName}, id=${id}`);
    const result = await this.databaseService.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
      true,
    );
    return (result.rowCount ?? 0) > 0;
  }
}
