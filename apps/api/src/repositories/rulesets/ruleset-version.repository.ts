import {
  BaseRepository,
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  RulesetVersion,
  type RulesetIngestionState,
  type RulesetReviewStatus,
} from 'src/modules/rulesets/entities/ruleset-version.entity';
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
  ingestion_status: RulesetIngestionState;
  chunk_count: number | null;
  ingestion_error: string | null;
  ingested_at: Date | null;
  review_status: RulesetReviewStatus;
  reviewed_by: string | null;
  /** Selected as text: YYYY-MM-DD, no timezone shift */
  reviewed_at: string | null;
  review_notes: string | null;
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

  /**
   * Makes `versionId` the ruleset's only active version, in the caller's transaction. Only an
   * ingested version: false (nothing changed) otherwise, or if the version is gone.
   */
  async activate(
    rulesetId: string,
    versionId: string,
    client: PoolClient,
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE ${this.tableName} SET is_active = true
       WHERE id = $1 AND ruleset_id = $2 AND ingestion_status = 'ingested'`,
      [versionId, rulesetId],
    );
    if (result.rowCount !== 1) return false;
    await client.query(
      `UPDATE ${this.tableName} SET is_active = false
       WHERE ruleset_id = $1 AND id <> $2 AND is_active`,
      [rulesetId, versionId],
    );
    return true;
  }

  /** Records the legal review of a version (D-9). */
  async recordReview(
    versionId: string,
    review: { reviewedBy: string; reviewedAt: string; notes: string | null },
    options?: QueryOptions,
  ): Promise<RulesetVersion | null> {
    const result = await this.executeQuery<RulesetVersionRow>(
      `UPDATE ${this.tableName}
       SET review_status = 'reviewed', reviewed_by = $2, reviewed_at = $3::date, review_notes = $4
       WHERE id = $1
       RETURNING ${this.getSelectColumns()}`,
      [versionId, review.reviewedBy, review.reviewedAt, review.notes],
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
    return 'id, ruleset_id, version, clauses, changelog, rolled_back_from_version, is_active, created_by, created_at, ingestion_status, chunk_count, ingestion_error, ingested_at, review_status, reviewed_by, reviewed_at::text AS reviewed_at, review_notes';
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
      ingestionStatus: data.ingestion_status,
      chunkCount: data.chunk_count,
      ingestionError: data.ingestion_error,
      ingestedAt: data.ingested_at,
      reviewStatus: data.review_status,
      reviewedBy: data.reviewed_by,
      reviewedAt: data.reviewed_at,
      reviewNotes: data.review_notes,
    };
  }
}
