import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import {
  QueryOptions,
  CursorPaginationOptions,
  CursorPaginationResult,
} from '../base/repository.interface';
import { Category } from 'src/modules/categories/entities/category.entity';
import { CursorPaginationHelper } from '../base/cursor-pagination.helper';

/**
 * Type for creating a new category row in the database.
 */
export type CreateCategoryRow = {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  parent_id?: string | null;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing category row in the database.
 */
export type UpdateCategoryRow = {
  code?: string;
  name?: string;
  description?: string | null;
  parent_id?: string | null;
  is_active?: boolean;
  updated_at?: Date;
};

type CategoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Category entities.
 * Handles database operations for template categories.
 */
@Injectable()
export class CategoryRepository extends BaseRepository<
  Category,
  CreateCategoryRow,
  UpdateCategoryRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.categories');
  }

  /**
   * Find categories with cursor-based pagination.
   * Supports filtering by is_active, parent_id, and code.
   *
   * @param filters - Optional filters for is_active, parent_id, and code
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options (tenant context, client, etc.)
   * @returns Cursor-paginated results with navigation metadata
   */
  async findMany(
    filters: { is_active?: boolean; parent_id?: string; code?: string } = {},
    cursorOptions?: CursorPaginationOptions,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<Category>> {
    // Validate and normalize cursor options
    const { cursor, limit, direction } =
      CursorPaginationHelper.validateOptions(cursorOptions);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      conditions.push(`is_active = $${params.length}`);
    }
    if (filters.parent_id) {
      params.push(filters.parent_id);
      conditions.push(`parent_id = $${params.length}`);
    }
    if (filters.code) {
      params.push(filters.code);
      conditions.push(`code = $${params.length}`);
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
    const result = await this.executeQuery<CategoryRow>(query, params, options);

    const mappedRows = result.rows.map((row) => this.mapRow(row));

    return CursorPaginationHelper.createPaginationResponse(
      mappedRows,
      limit,
      direction,
      !!cursor,
    );
  }

  /**
   * Find all active categories.
   * Uses cursor pagination internally but returns only the first 1000 rows (if more exist, they are NOT returned).
   *
   * @note This method does NOT fetch more than 1000 active categories.
   *
   * @param options - Query options (tenant context, client, etc.)
   * @returns Array of active categories
   */
  async findActive(options?: QueryOptions): Promise<Category[]> {
    const result = await this.findMany(
      { is_active: true },
      { limit: 1000 },
      options,
    );
    return result.data;
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, code, name, description, parent_id, is_active, created_at, updated_at';
  }

  /**
   * Map a database row to a Category domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped Category entity
   */
  protected mapRow(row: Record<string, unknown>): Category {
    const data = row as CategoryRow;
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description,
      parent_id: data.parent_id,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
