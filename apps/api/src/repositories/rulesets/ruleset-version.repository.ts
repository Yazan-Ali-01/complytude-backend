import {
  BaseRepository,
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import { RulesetVersion } from 'src/modules/rulesets/entities/ruleset-version.entity';
import { RulesetClause } from 'src/modules/rulesets/entities/ruleset.entity';

export type CreateRulesetVersionRow = {
  ruleset_id: string;
  version: string;
  /** JSON string (stringified by service before passing) */
  clauses: string;
  changelog?: string | null;
  rolled_back_from_version?: string | null;
  is_active?: boolean;
  created_by?: string | null;
};

type RulesetVersionRow = {
  id: string;
  ruleset_id: string;
  version: string;
  clauses: RulesetClause[];
  changelog: string | null;
  rolled_back_from_version: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
};

@Injectable()
export class RulesetVersionRepository extends BaseRepository<
  RulesetVersion,
  CreateRulesetVersionRow,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.ruleset_versions');
  }

  async findByRulesetId(
    rulesetId: string,
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
    options?: QueryOptions,
  ): Promise<OffsetPaginationResult<RulesetVersion>> {
    const countResult = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ruleset_id = $1`,
      [rulesetId],
      options,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const sortOrder = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    const dataResult = await this.executeQuery<RulesetVersionRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE ruleset_id = $1
       ORDER BY created_at ${sortOrder}
       LIMIT $2 OFFSET $3`,
      [rulesetId, pagination.limit, offset],
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

  async findByRulesetIdAndVersion(
    rulesetId: string,
    version: string,
    options?: QueryOptions,
  ): Promise<RulesetVersion | null> {
    const result = await this.executeQuery<RulesetVersionRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE ruleset_id = $1 AND version = $2`,
      [rulesetId, version],
      options,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** Deactivates every other version of the ruleset, leaving `keepVersionId` the active one. */
  async deactivateOthers(
    rulesetId: string,
    keepVersionId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} SET is_active = false
       WHERE ruleset_id = $1 AND id <> $2 AND is_active`,
      [rulesetId, keepVersionId],
      options,
    );
  }

  async findActiveByRulesetId(
    rulesetId: string,
    options?: QueryOptions,
  ): Promise<RulesetVersion | null> {
    const result = await this.executeQuery<RulesetVersionRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE ruleset_id = $1 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [rulesetId],
      options,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** Every ruleset's active version: what retrieval can cite. */
  async findAllActive(options?: QueryOptions): Promise<RulesetVersion[]> {
    const result = await this.executeQuery<RulesetVersionRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE is_active = true
       ORDER BY created_at`,
      [],
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  protected getSelectColumns(): string {
    return 'id, ruleset_id, version, clauses, changelog, rolled_back_from_version, is_active, created_by, created_at';
  }

  protected mapRow(row: Record<string, unknown>): RulesetVersion {
    const data = row as RulesetVersionRow;
    return {
      id: data.id,
      rulesetId: data.ruleset_id,
      version: data.version,
      clauses: data.clauses,
      changelog: data.changelog,
      rolledBackFromVersion: data.rolled_back_from_version,
      isActive: data.is_active,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
  }
}
