import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';

export type FindingDecision = 'accepted' | 'dismissed';

export interface FindingFeedback {
  id: string;
  tenantId: string;
  analysisJobId: string;
  findingId: string;
  decision: FindingDecision;
  reason: string | null;
  model: string | null;
  promptVersion: number | null;
  rulesetKey: string | null;
  chunkId: string | null;
  decidedBy: string | null;
  decidedAt: Date;
}

export interface RecordFindingFeedback {
  tenantId: string;
  analysisJobId: string;
  findingId: string;
  decision: FindingDecision;
  reason: string | null;
  model: string | null;
  promptVersion: number | null;
  rulesetKey: string | null;
  chunkId: string | null;
  decidedBy: string;
}

type FeedbackRow = {
  id: string;
  tenant_id: string;
  analysis_job_id: string;
  finding_id: string;
  decision: FindingDecision;
  reason: string | null;
  model: string | null;
  prompt_version: number | null;
  ruleset_key: string | null;
  chunk_id: string | null;
  decided_by: string | null;
  decided_at: Date;
};

/** Users' accept or dismiss decisions on analysis findings (one per finding). */
@Injectable()
export class AnalysisFindingFeedbackRepository extends BaseRepository<
  FindingFeedback,
  never,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.analysis_finding_feedback');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, analysis_job_id, finding_id, decision, reason, model, prompt_version, ruleset_key, chunk_id, decided_by, decided_at';
  }

  protected mapRow(row: Record<string, unknown>): FindingFeedback {
    const data = row as FeedbackRow;
    return {
      id: data.id,
      tenantId: data.tenant_id,
      analysisJobId: data.analysis_job_id,
      findingId: data.finding_id,
      decision: data.decision,
      reason: data.reason,
      model: data.model,
      promptVersion: data.prompt_version,
      rulesetKey: data.ruleset_key,
      chunkId: data.chunk_id,
      decidedBy: data.decided_by,
      decidedAt: data.decided_at,
    };
  }

  /** Records a decision; a later one on the same finding replaces it. */
  async record(
    input: RecordFindingFeedback,
    options?: QueryOptions,
  ): Promise<FindingFeedback> {
    const result = await this.executeQuery<FeedbackRow>(
      `INSERT INTO ${this.tableName}
         (tenant_id, analysis_job_id, finding_id, decision, reason, model, prompt_version,
          ruleset_key, chunk_id, decided_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (analysis_job_id, finding_id) DO UPDATE
       SET decision = EXCLUDED.decision, reason = EXCLUDED.reason,
           decided_by = EXCLUDED.decided_by, decided_at = now()
       RETURNING ${this.getSelectColumns()}`,
      [
        input.tenantId,
        input.analysisJobId,
        input.findingId,
        input.decision,
        input.reason,
        input.model,
        input.promptVersion,
        input.rulesetKey,
        input.chunkId,
        input.decidedBy,
      ],
      options,
    );
    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  async findByAnalysisJob(
    analysisJobId: string,
    options?: QueryOptions,
  ): Promise<FindingFeedback[]> {
    const result = await this.executeQuery<FeedbackRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE analysis_job_id = $1
       ORDER BY decided_at`,
      [analysisJobId],
      options,
    );
    return result.rows.map((row) =>
      this.mapRow(row as Record<string, unknown>),
    );
  }
}
