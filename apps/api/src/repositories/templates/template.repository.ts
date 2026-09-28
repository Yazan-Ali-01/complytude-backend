import {
  BaseRepository,
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import { Template } from 'src/modules/templates/entities/template.entity';

/**
 * Type for creating a new template row in the database.
 */
export type CreateTemplateRow = {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  category_id?: string | null;
  authority_id?: string | null;
  languages?: string[];
  current_version?: string;
  status?: 'active' | 'inactive' | 'draft' | 'deprecated';
  tier?: 'essential' | 'full';
  file_url?: string | null;
  thumbnail_url?: string | null;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing template row in the database.
 */
export type UpdateTemplateRow = {
  key?: string;
  name?: string;
  description?: string | null;
  category_id?: string | null;
  authority_id?: string | null;
  languages?: string[];
  current_version?: string;
  status?: 'active' | 'inactive' | 'draft' | 'deprecated';
  tier?: 'essential' | 'full';
  file_url?: string | null;
  thumbnail_url?: string | null;
  updated_at?: Date;
};

export type TemplateFilters = {
  status?: string;
  categoryId?: string;
  authorityId?: string;
  language?: string;
  search?: string;
};

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  created_at: 'created_at',
  updated_at: 'updated_at',
  name: 'name',
  key: 'key',
};

type TemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category_id: string | null;
  authority_id: string | null;
  languages: string[];
  current_version: string;
  status: Template['status'];
  tier: Template['tier'];
  file_url: string | null;
  thumbnail_url: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Template entities.
 * Handles database operations for compliance templates.
 */
@Injectable()
export class TemplateRepository extends BaseRepository<
  Template,
  CreateTemplateRow,
  UpdateTemplateRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.templates');
  }

  /**
   * Find templates, page by page, newest first.
   *
   * @param filters - status, category, authority, language, and a name/description search
   * @param pagination - page and page size
   * @param options - Query options (client, etc.)
   */
  async findMany(
    filters: TemplateFilters = {},
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
    options?: QueryOptions,
  ): Promise<OffsetPaginationResult<Template>> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.categoryId) {
      params.push(filters.categoryId);
      conditions.push(`category_id = $${params.length}`);
    }
    if (filters.authorityId) {
      params.push(filters.authorityId);
      conditions.push(`authority_id = $${params.length}`);
    }
    if (filters.language) {
      params.push(filters.language);
      conditions.push(`$${params.length} = ANY(languages)`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR description ILIKE $${params.length})`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${this.tableName} ${whereClause}`,
      params,
      options,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const sortColumn =
      ALLOWED_SORT_COLUMNS[pagination.sortBy ?? ''] ?? 'created_at';
    const sortOrder = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    params.push(pagination.limit, offset);
    const dataResult = await this.executeQuery<TemplateRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} ${whereClause} ORDER BY ${sortColumn} ${sortOrder}, id LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
      options,
    );

    const totalPages = Math.ceil(total / pagination.limit);

    return {
      data: dataResult.rows.map((row) => this.mapRow(row)),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
      hasNextPage: pagination.page < totalPages,
      hasPreviousPage: pagination.page > 1,
    };
  }

  /** All active templates, by name. */
  async findActive(options?: QueryOptions): Promise<Template[]> {
    const result = await this.executeQuery<TemplateRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE status = 'active' ORDER BY name`,
      [],
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, key, name, description, category_id, authority_id, languages, current_version, status, tier, file_url, thumbnail_url, created_by, created_at, updated_at';
  }

  /**
   * Map a database row to a Template domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped Template entity
   */
  protected mapRow(row: Record<string, unknown>): Template {
    const data = row as TemplateRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description,
      category_id: data.category_id,
      authority_id: data.authority_id,
      languages: data.languages,
      current_version: data.current_version,
      status: data.status,
      tier: data.tier,
      file_url: data.file_url,
      thumbnail_url: data.thumbnail_url,
      created_by: data.created_by,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Update the status of a template by its key.
   *
   * @param key - The unique key of the template
   * @param status - New status to apply
   * @param options - Query options
   * @returns Updated Template entity or null if not found
   */
  async updateStatusByKey(
    key: string,
    status: Template['status'],
    options?: QueryOptions,
  ): Promise<Template | null> {
    const result = await this.executeQuery<TemplateRow>(
      `UPDATE ${this.tableName} SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2 RETURNING ${this.getSelectColumns()}`,
      [status, key],
      options,
    );

    if (!result.rows.length) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Delete a template by its key.
   *
   * @param key - The unique key of the template
   * @param options - Query options
   * @returns Number of rows deleted (0 if not found)
   */
  async deleteByKey(key: string, options?: QueryOptions): Promise<number> {
    const result = await this.executeQuery(
      `DELETE FROM ${this.tableName} WHERE key = $1`,
      [key],
      options,
    );

    return result.rowCount ?? 0;
  }
}
