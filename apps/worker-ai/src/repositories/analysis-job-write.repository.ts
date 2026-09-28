import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { AnalysisResult } from '../interfaces/analysis-result.interface';

export type AnalysisJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed';

export interface AnalysisJobRow {
  id: string;
  status: AnalysisJobStatus;
  document_id: string;
}

/**
 * analysis_jobs has RLS with FORCE ROW LEVEL SECURITY. Every query runs in the job's tenant
 * context (from the payload), so a job of any other tenant is neither seen nor changed.
 */
@Injectable()
export class AnalysisJobWriteRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Atomically transitions the job to 'processing'.
   * Only succeeds when status is 'queued' (first attempt) or 'processing' (crash-recovery retry).
   * Returns true if this worker claimed the job, false if another worker beat it.
   */
  async markProcessing(tenantId: string, id: string): Promise<boolean> {
    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        const result = await client.query<{ id: string }>(
          `UPDATE public.analysis_jobs
           SET status = 'processing',
               started_at = COALESCE(started_at, now()),
               updated_at = now()
           WHERE id = $1 AND status IN ('queued', 'processing')
           RETURNING id`,
          [id],
        );
        return (result.rowCount ?? 0) > 0;
      },
    );
  }

  async markCompleted(
    tenantId: string,
    id: string,
    status: 'completed' | 'completed_with_warnings',
    result: AnalysisResult,
  ): Promise<void> {
    await this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        await client.query(
          `UPDATE public.analysis_jobs
           SET status = $3, result = $2::jsonb, completed_at = now(), updated_at = now()
           WHERE id = $1`,
          [id, JSON.stringify(result), status],
        );
      },
    );
  }

  async markFailed(tenantId: string, id: string, error: string): Promise<void> {
    await this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        await client.query(
          `UPDATE public.analysis_jobs
           SET status = 'failed', error = $2, failed_at = now(), updated_at = now()
           WHERE id = $1`,
          [id, error],
        );
      },
    );
  }

  async findById(tenantId: string, id: string): Promise<AnalysisJobRow | null> {
    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        const result = await client.query<AnalysisJobRow>(
          `SELECT id, status, document_id FROM public.analysis_jobs WHERE id = $1`,
          [id],
        );
        return result.rows[0] ?? null;
      },
    );
  }
}
