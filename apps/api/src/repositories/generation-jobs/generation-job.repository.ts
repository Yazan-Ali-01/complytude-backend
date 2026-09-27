import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';

export const GENERATION_JOB_STATUSES = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type GenerationJobStatus =
  (typeof GENERATION_JOB_STATUSES)[keyof typeof GENERATION_JOB_STATUSES];

export type GenerationJobType = 'preview' | 'generate';

export interface GenerationJob {
  id: string;
  tenant_id: string;
  template_id: string;
  template_version_id: string;
  document_id: string | null;
  job_type: GenerationJobType;
  status: GenerationJobStatus;
  variables: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_by: string;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type CreateGenerationJobRow = {
  tenant_id: string;
  template_id: string;
  template_version_id: string;
  document_id?: string | null;
  job_type: GenerationJobType;
  status: GenerationJobStatus;
  variables: string; // Stringified JSONB
  created_by: string;
};

export type UpdateGenerationJobRow = {
  status?: GenerationJobStatus;
  result?: string | null;
  error?: string | null;
  started_at?: Date | null;
  completed_at?: Date | null;
  failed_at?: Date | null;
};

type GenerationJobRow = {
  id: string;
  tenant_id: string;
  template_id: string;
  template_version_id: string;
  document_id: string | null;
  job_type: GenerationJobType;
  status: GenerationJobStatus;
  variables: string | Record<string, unknown>;
  result: string | Record<string, unknown> | null;
  error: string | null;
  created_by: string;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class GenerationJobRepository extends BaseRepository<
  GenerationJob,
  CreateGenerationJobRow,
  UpdateGenerationJobRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.generation_jobs');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, template_id, template_version_id, document_id, job_type, status, variables, result, error, created_by, started_at, completed_at, failed_at, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): GenerationJob {
    const data = row as GenerationJobRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      template_id: data.template_id,
      template_version_id: data.template_version_id,
      document_id: data.document_id,
      job_type: data.job_type,
      status: data.status,
      variables: this.parseJsonb(data.variables),
      result: data.result === null ? null : this.parseJsonb(data.result),
      error: data.error,
      created_by: data.created_by,
      started_at: data.started_at,
      completed_at: data.completed_at,
      failed_at: data.failed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async findByIdForTenant(
    id: string,
    tenantId: string,
    options?: QueryOptions,
  ): Promise<GenerationJob | null> {
    const columns = this.getSelectColumns();
    const result = await this.executeQuery(
      `SELECT ${columns} FROM public.generation_jobs WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
      options,
    );
    return result.rows[0]
      ? this.mapRow(result.rows[0] as Record<string, unknown>)
      : null;
  }

  private parseJsonb(
    value: string | Record<string, unknown>,
  ): Record<string, unknown> {
    if (typeof value === 'string') {
      return JSON.parse(value) as Record<string, unknown>;
    }
    return value;
  }
}
