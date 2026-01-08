import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import {
  QueryOptions,
  CursorPaginationOptions,
  CursorPaginationResult,
} from '../base/repository.interface';
import { Authority } from 'src/modules/templates/entities/authority.entity';
import { CursorPaginationHelper } from '../base/cursor-pagination.helper';

/**
 * Type for creating a new authority row in the database.
 */
export type CreateAuthorityRow = {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  country?: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing authority row in the database.
 */
export type UpdateAuthorityRow = {
  code?: string;
  name?: string;
  description?: string | null;
  country?: string;
  is_active?: boolean;
  updated_at?: Date;
};

type AuthorityRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  country: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Authority entities.
 * Handles database operations for regulatory authorities.
 */
@Injectable()
export class AuthorityRepository extends BaseRepository<
  Authority,
  CreateAuthorityRow,
  UpdateAuthorityRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.authorities');
  }

  /**
   * Find authorities with cursor-based pagination.
   * Supports filtering by is_active, country, and code.
   *
   * @param filters - Optional filters for is_active, country, and code
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options (tenant context, client, etc.)
   * @returns Cursor-paginated results with navigation metadata
   */
  async findMany(
    filters: { is_active?: boolean; country?: string; code?: string } = {},
    cursorOptions?: CursorPaginationOptions,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<Authority>> {
    // Validate and normalize cursor options
    const { cursor, limit, direction } =
      CursorPaginationHelper.validateOptions(cursorOptions);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      conditions.push(`is_active = $${params.length}`);
    }
    if (filters.country) {
      params.push(filters.country);
      conditions.push(`country = $${params.length}`);
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
    const result = await this.executeQuery<AuthorityRow>(
      query,
      params,
      options,
    );

    const mappedRows = result.rows.map((row) => this.mapRow(row));

    return CursorPaginationHelper.createPaginationResponse(
      mappedRows,
      limit,
      direction,
      !!cursor,
    );
  }

  /**
   * Find all active authorities.
   * Uses cursor pagination internally but returns only the first 1000 rows (if more exist, they are NOT returned).
   *
   * @note This method does NOT fetch more than 1000 active authorities.
   *
   * @param options - Query options (tenant context, client, etc.)
   * @returns Array of active authorities
   */
  async findActive(options?: QueryOptions): Promise<Authority[]> {
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
    return 'id, code, name, description, country, is_active, created_at, updated_at';
  }

  /**
   * Map a database row to an Authority domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped Authority entity
   */
  protected mapRow(row: Record<string, unknown>): Authority {
    const data = row as AuthorityRow;
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description,
      country: data.country,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
