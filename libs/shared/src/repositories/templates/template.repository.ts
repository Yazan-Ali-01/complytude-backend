import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import {
  QueryOptions,
  CursorPaginationOptions,
  CursorPaginationResult,
} from '../base/repository.interface';
import { Template } from '../../types/entities.js';
import { CursorPaginationHelper } from '../base/cursor-pagination.helper';

/**
 * Type for creating a new template row in the database.
 * JSON/JSONB fields must be pre-stringified.
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
  file_url?: string | null;
  thumbnail_url?: string | null;
  metadata: string; // Stringified JSONB object
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing template row in the database.
 * JSON/JSONB fields must be pre-stringified.
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
  file_url?: string | null;
  thumbnail_url?: string | null;
  metadata?: string; // Stringified JSONB object
  updated_at?: Date;
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
  file_url: string | null;
  thumbnail_url: string | null;
  metadata: string | Record<string, unknown>;
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
   * Find templates with cursor-based pagination.
   * Supports filtering by status, categoryId, authorityId, and language.
   *
   * @param filters - Optional filters for status, categoryId, authorityId, and language
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options (tenant context, client, etc.)
   * @returns Cursor-paginated results with navigation metadata
   */
  async findMany(
    filters: {
      status?: string;
      categoryId?: string;
      authorityId?: string;
      language?: string;
    } = {},
    cursorOptions?: CursorPaginationOptions,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<Template>> {
    // Validate and normalize cursor options
    const { cursor, limit, direction } =
      CursorPaginationHelper.validateOptions(cursorOptions);

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

    // Add cursor condition using helper
    const cursorQuery = CursorPaginationHelper.buildCursorQuery(
      direction,
      cursor,
      params.length + 1,
    );

    if (cursorQuery.clause) {
      conditions.push(cursorQuery.clause);
      params.push(...cursorQuery.params);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limitClause = CursorPaginationHelper.buildLimitClause(
      limit,
      params.length + 1,
    );
    params.push(...limitClause.params);

    const query =
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} ${whereClause} ${cursorQuery.orderClause} ${limitClause.clause}`.trim();
    const result = await this.executeQuery<TemplateRow>(query, params, options);

    const mappedRows = result.rows.map((row) => this.mapRow(row));

    return CursorPaginationHelper.createPaginationResponse(
      mappedRows,
      limit,
      direction,
      !!cursor,
    );
  }

  /**
   * Find all active templates.
   * Uses cursor pagination internally but returns only the first 1000 rows (if more exist, they are NOT returned).
   *
   * @note This method does NOT fetch more than 1000 active templates.
   *
   * @param options - Query options (tenant context, client, etc.)
   * @returns Array of active templates
   */
  async findActive(options?: QueryOptions): Promise<Template[]> {
    const result = await this.findMany(
      { status: 'active' },
      { limit: 1000 },
      options,
    );
    return result.data;
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, key, name, description, category_id, authority_id, languages, current_version, status, file_url, thumbnail_url, metadata, created_by, created_at, updated_at';
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
      file_url: data.file_url,
      thumbnail_url: data.thumbnail_url,
      metadata: data.metadata as Record<string, unknown>,
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
      `UPDATE ${this.tableName} SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2 RETURNING *`,
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
