import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import {
  QueryOptions,
  CursorPaginationOptions,
  CursorPaginationResult,
} from '../base/repository.interface';
import { Ruleset, RulesetClause } from '../../types/entities.js';
import { CursorPaginationHelper } from '../base/cursor-pagination.helper';

/**
 * Type for creating a new ruleset row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type CreateRulesetRow = {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  authority_id?: string | null;
  clauses: string; // Stringified JSONB array
  metadata: string; // Stringified JSONB object
  version?: string;
  status?: 'active' | 'inactive' | 'deprecated';
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing ruleset row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type UpdateRulesetRow = {
  key?: string;
  name?: string;
  description?: string | null;
  authority_id?: string | null;
  clauses?: string; // Stringified JSONB array
  metadata?: string; // Stringified JSONB object
  version?: string;
  status?: 'active' | 'inactive' | 'deprecated';
  updated_at?: Date;
};

type RulesetRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  authority_id: string | null;
  clauses: string | unknown[];
  metadata: string | Record<string, unknown>;
  version: string;
  status: Ruleset['status'];
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Ruleset entities.
 * Handles database operations for compliance rulesets.
 */
@Injectable()
export class RulesetRepository extends BaseRepository<
  Ruleset,
  CreateRulesetRow,
  UpdateRulesetRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.rulesets');
  }

  /**
   * Find rulesets with cursor-based pagination.
   * Supports filtering by authority_id and status.
   *
   * @param filters - Optional filters for authority_id and status
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options (tenant context, client, etc.)
   * @returns Cursor-paginated results with navigation metadata
   */
  async findMany(
    filters: { authority_id?: string; status?: string } = {},
    cursorOptions?: CursorPaginationOptions,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<Ruleset>> {
    // Validate and normalize cursor options
    const { cursor, limit, direction } =
      CursorPaginationHelper.validateOptions(cursorOptions);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.authority_id) {
      params.push(filters.authority_id);
      conditions.push(`authority_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
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
    const result = await this.executeQuery<RulesetRow>(query, params, options);

    const mappedRows = result.rows.map((row) => this.mapRow(row));

    return CursorPaginationHelper.createPaginationResponse(
      mappedRows,
      limit,
      direction,
      !!cursor,
    );
  }

  /**
   * Find all active rulesets.
   * Uses cursor pagination internally but returns only the first 1000 rows (if more exist, they are NOT returned).
   *
   * @note This method does NOT fetch more than 1000 active rulesets.
   *
   * @param options - Query options (tenant context, client, etc.)
   * @returns Array of active rulesets
   */
  async findActive(options?: QueryOptions): Promise<Ruleset[]> {
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
    return 'id, key, name, description, authority_id, clauses, metadata, version, status, created_by, created_at, updated_at';
  }

  /**
   * Map a database row to a Ruleset domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped Ruleset entity
   */
  protected mapRow(row: Record<string, unknown>): Ruleset {
    const data = row as RulesetRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description,
      authority_id: data.authority_id,
      clauses: data.clauses as RulesetClause[],
      metadata: data.metadata as Record<string, unknown>,
      version: data.version,
      status: data.status,
      created_by: data.created_by,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Find rulesets associated with a specific template.
   *
   * @param templateId - The ID of the template
   * @param options - Query options
   * @returns Array of associated rulesets
   */
  async findByTemplateId(
    templateId: string,
    options?: QueryOptions,
  ): Promise<Ruleset[]> {
    const result = await this.executeQuery<RulesetRow>(
      `
      SELECT r.*
      FROM public.rulesets r
      INNER JOIN public.template_rulesets tr ON r.id = tr.ruleset_id
      WHERE tr.template_id = $1
    `,
      [templateId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find multiple rulesets by their keys.
   * Only returns active rulesets.
   *
   * @param keys - Array of ruleset keys to find
   * @param options - Query options
   * @returns Array of found active rulesets
   */
  async findByKeys(keys: string[], options?: QueryOptions): Promise<Ruleset[]> {
    if (!keys.length) return [];

    const result = await this.executeQuery<RulesetRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE key IN ($1) AND status = $2 ORDER BY name`,
      [keys, 'active'],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Delete a ruleset by its key.
   *
   * @param key - The unique key of the ruleset
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

  /**
   * Associate rulesets with a template.
   * Ignores duplicates if association already exists.
   *
   * @param templateId - The ID of the template
   * @param rulesetIds - Array of ruleset IDs to associate
   * @param options - Query options
   */
  async associateWithTemplate(
    templateId: string,
    rulesetIds: string[],
    options?: QueryOptions,
  ): Promise<void> {
    for (const rulesetId of rulesetIds) {
      await this.executeQuery(
        `
          INSERT INTO public.template_rulesets (template_id, ruleset_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [templateId, rulesetId],
        options,
      );
    }
  }

  /**
   * Remove all ruleset associations for a specific template.
   *
   * @param templateId - The ID of the template
   * @param options - Query options
   */
  async removeTemplateAssociations(
    templateId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      'DELETE FROM public.template_rulesets WHERE template_id = $1',
      [templateId],
      options,
    );
  }
}
