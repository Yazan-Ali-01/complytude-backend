import { Injectable, Logger } from '@nestjs/common';
import { Tenant, TenantFeatures } from '../../types/entities.js';
import { PlanTier } from '../../types/plans.js';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { CursorPaginationHelper } from '../base/cursor-pagination.helper';
import {
  CursorPaginationOptions,
  CursorPaginationResult,
  QueryOptions,
} from '../base/repository.interface';

/**
 * Type for creating a new tenant row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type CreateTenantRow = {
  id?: string; // UUID, defaults to gen_random_uuid()
  plan: PlanTier;
  features: string; // Stringified JSONB
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing tenant row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type UpdateTenantRow = {
  plan?: PlanTier;
  features?: string; // Stringified JSONB
  is_active?: boolean;
  updated_at?: Date;
};

type TenantRow = {
  id: string;
  plan: PlanTier;
  features: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Tenant entities and their infrastructure.
 * Handles database operations for tenants, including schema creation and isolation.
 */
@Injectable()
export class TenantRepository extends BaseRepository<
  Tenant,
  CreateTenantRow,
  UpdateTenantRow
> {
  private readonly tenantLogger = new Logger(TenantRepository.name);

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.tenants');
  }

  /**
   * Find tenants with cursor-based pagination.
   * Supports filtering by is_active and id.
   *
   * @param filters - Optional filters for is_active and id
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options (tenant context, client, etc.)
   * @returns Cursor-paginated results with navigation metadata
   */
  async findMany(
    filters: { is_active?: boolean; id?: string } = {},
    cursorOptions?: CursorPaginationOptions,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<Tenant>> {
    // Validate and normalize cursor options
    const { cursor, limit, direction } =
      CursorPaginationHelper.validateOptions(cursorOptions);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      conditions.push(`is_active = $${params.length}`);
    }
    if (filters.id) {
      params.push(filters.id);
      conditions.push(`id = $${params.length}`);
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
    const result = await this.executeQuery<TenantRow>(query, params, options);

    const mappedRows = result.rows.map((row) => this.mapRow(row));

    return CursorPaginationHelper.createPaginationResponse(
      mappedRows,
      limit,
      direction,
      !!cursor,
    );
  }

  /**
   * Find all active tenants.
   * Uses cursor pagination internally but returns only the first 1000 rows (if more exist, they are NOT returned).
   *
   * @note This method does NOT fetch more than 1000 active tenants.
   *
   * @param options - Query options (tenant context, client, etc.)
   * @returns Array of active tenants
   */
  async findActive(options?: QueryOptions): Promise<Tenant[]> {
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
    return 'id, plan, features, is_active, created_at, updated_at';
  }

  /**
   * Map a database row to a Tenant domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped Tenant entity
   */
  protected mapRow(row: Record<string, unknown>): Tenant {
    const data = row as TenantRow;
    return {
      id: data.id,
      plan: data.plan,
      features: data.features as TenantFeatures,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Get the count of documents for a tenant.
   * Uses RLS - documents are in public.documents table with tenant_id column.
   *
   * @param tenantId - The tenant ID
   * @param options - Query options
   * @returns Number of documents
   */
  async getDocumentCount(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<number> {
    this.tenantLogger.debug(`Getting document count: tenant_id=${tenantId}`);

    const result = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM public.documents WHERE tenant_id = $1`,
      [tenantId],
      options,
    );

    const count = parseInt(result.rows[0]?.count || '0', 10);
    this.tenantLogger.debug(
      `Document count: tenant_id=${tenantId}, count=${count}`,
    );
    return count;
  }
}
