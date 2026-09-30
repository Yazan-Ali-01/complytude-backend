import {
  BaseRepository,
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  Ruleset,
  RulesetStatus,
} from 'src/modules/rulesets/entities/ruleset.entity';

export type CreateRulesetRow = {
  key: string;
  name: string;
  description?: string | null;
  authority_id?: string | null;
  jurisdictions?: string[];
  document_types?: string[];
  status?: RulesetStatus;
  created_by?: string | null;
};

export type UpdateRulesetRow = {
  name?: string;
  description?: string | null;
  authority_id?: string | null;
  jurisdictions?: string[];
  document_types?: string[];
  status?: RulesetStatus;
};

export interface RulesetFilters {
  status?: RulesetStatus;
  authorityId?: string;
  search?: string;
}

type RulesetRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  authority_id: string | null;
  jurisdictions: string[];
  document_types: string[];
  current_version: string;
  status: RulesetStatus;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  key: 'key',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

@Injectable()
export class RulesetRepository extends BaseRepository<
  Ruleset,
  CreateRulesetRow,
  UpdateRulesetRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.rulesets');
  }

  async findMany(
    filters: RulesetFilters = {},
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
    options?: QueryOptions,
  ): Promise<OffsetPaginationResult<Ruleset>> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.authorityId) {
      params.push(filters.authorityId);
      conditions.push(`authority_id = $${params.length}`);
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
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
      params,
      options,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const sortColumn =
      ALLOWED_SORT_COLUMNS[pagination.sortBy ?? ''] ?? 'created_at';
    const sortOrder = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    params.push(pagination.limit, offset);
    const dataResult = await this.executeQuery<RulesetRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} ${whereClause} ORDER BY ${sortColumn} ${sortOrder} LIMIT $${params.length - 1} OFFSET $${params.length}`,
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

  async findByKey(
    key: string,
    options?: QueryOptions,
  ): Promise<Ruleset | null> {
    const result = await this.executeQuery<RulesetRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE key = $1`,
      [key],
      options,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** Which of the given ruleset IDs exist and are active. */
  async findActiveIds(
    ids: string[],
    options?: QueryOptions,
  ): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const result = await this.executeQuery<{ id: string }>(
      `SELECT id FROM ${this.tableName} WHERE id = ANY($1::uuid[]) AND status = 'active'`,
      [ids],
      options,
    );
    return new Set(result.rows.map((row) => row.id));
  }

  async findByKeys(keys: string[], options?: QueryOptions): Promise<Ruleset[]> {
    if (!keys.length) return [];

    const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
    const result = await this.executeQuery<RulesetRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE key IN (${placeholders}) AND status = 'active' ORDER BY name`,
      keys,
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** Active rulesets tagged with both the jurisdiction and the document type. */
  async findApplicable(
    jurisdiction: string,
    documentType: string,
    options?: QueryOptions,
  ): Promise<Ruleset[]> {
    const result = await this.executeQuery<RulesetRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE status = 'active' AND $1 = ANY(jurisdictions) AND $2 = ANY(document_types)
       ORDER BY name`,
      [jurisdiction, documentType],
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async setCurrentVersion(
    rulesetId: string,
    version: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} SET current_version = $2, updated_at = now() WHERE id = $1`,
      [rulesetId, version],
      options,
    );
  }

  async deactivateByKey(
    key: string,
    options?: QueryOptions,
  ): Promise<Ruleset | null> {
    const result = await this.executeQuery<RulesetRow>(
      `UPDATE ${this.tableName} SET status = 'inactive' WHERE key = $1 RETURNING ${this.getSelectColumns()}`,
      [key],
      options,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByTemplateId(
    templateId: string,
    options?: QueryOptions,
  ): Promise<Ruleset[]> {
    const result = await this.executeQuery<RulesetRow>(
      `SELECT ${this.getSelectColumns()
        .split(', ')
        .map((c) => `r.${c.trim()}`)
        .join(', ')}
       FROM ${this.tableName} r
       INNER JOIN public.template_rulesets tr ON r.id = tr.ruleset_id
       WHERE tr.template_id = $1`,
      [templateId],
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async associateWithTemplate(
    templateId: string,
    rulesetIds: string[],
    options?: QueryOptions,
  ): Promise<void> {
    if (!rulesetIds.length) return;

    const values = rulesetIds.map((_, idx) => `($1, $${idx + 2})`).join(', ');
    await this.executeQuery(
      `INSERT INTO public.template_rulesets (template_id, ruleset_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      [templateId, ...rulesetIds],
      options,
    );
  }

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

  protected getSelectColumns(): string {
    return 'id, key, name, description, authority_id, jurisdictions, document_types, current_version, status, created_by, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): Ruleset {
    const data = row as RulesetRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description,
      authorityId: data.authority_id,
      jurisdictions: data.jurisdictions,
      documentTypes: data.document_types,
      currentVersion: data.current_version,
      status: data.status,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}
