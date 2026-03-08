import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';

export const ANALYSIS_JOB_STATUSES = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type AnalysisJobStatus =
  (typeof ANALYSIS_JOB_STATUSES)[keyof typeof ANALYSIS_JOB_STATUSES];

export interface AnalysisJob {
  id: string;
  tenant_id: string;
  document_id: string;
  created_by: string | null;
  ruleset_id: string | null;
  ruleset_version_id: string | null;
  status: AnalysisJobStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type CreateAnalysisJobRow = {
  tenant_id: string;
  document_id: string;
  created_by?: string | null;
  ruleset_id?: string | null;
  ruleset_version_id?: string | null;
  status: AnalysisJobStatus;
};

export type UpdateAnalysisJobRow = {
  status?: AnalysisJobStatus;
  result?: string | null; // Stringified JSONB
  error?: string | null;
  started_at?: Date | null;
  completed_at?: Date | null;
};

type AnalysisJobRow = {
  id: string;
  tenant_id: string;
  document_id: string;
  created_by: string | null;
  ruleset_id: string | null;
  ruleset_version_id: string | null;
  status: AnalysisJobStatus;
  result: string | Record<string, unknown> | null;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class AnalysisJobRepository extends BaseRepository<
  AnalysisJob,
  CreateAnalysisJobRow,
  UpdateAnalysisJobRow
> {
  constructor(databaseService: DatabaseService, @I18n() i18n: I18nService) {
    super(databaseService, 'public.analysis_jobs', i18n);
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, document_id, created_by, ruleset_id, ruleset_version_id, status, result, error, started_at, completed_at, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): AnalysisJob {
    const data = row as AnalysisJobRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      document_id: data.document_id,
      created_by: data.created_by,
      ruleset_id: data.ruleset_id,
      ruleset_version_id: data.ruleset_version_id,
      status: data.status,
      result:
        data.result === null
          ? null
          : typeof data.result === 'string'
            ? (JSON.parse(data.result) as Record<string, unknown>)
            : data.result,
      error: data.error,
      started_at: data.started_at,
      completed_at: data.completed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async findLatestByDocument(
    documentId: string,
    options?: QueryOptions,
  ): Promise<AnalysisJob | null> {
    const columns = this.getSelectColumns();
    const result = await this.executeQuery(
      `SELECT ${columns} FROM public.analysis_jobs WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [documentId],
      options,
    );
    return result.rows[0]
      ? this.mapRow(result.rows[0] as Record<string, unknown>)
      : null;
  }
}
