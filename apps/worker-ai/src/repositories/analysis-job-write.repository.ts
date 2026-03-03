import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { AnalysisResult } from '../interfaces/analysis-result.interface';

export type AnalysisJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

@Injectable()
export class AnalysisJobWriteRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Atomically transitions the job to 'processing'.
   * Only succeeds when status is 'queued' (first attempt) or 'processing' (crash-recovery retry).
   * Returns true if this worker claimed the job, false if another worker beat it.
   */
  async markProcessing(id: string): Promise<boolean> {
    const result = await this.databaseService.query<{ id: string }>(
      `UPDATE public.analysis_jobs
       SET status = 'processing',
           started_at = COALESCE(started_at, now()),
           updated_at = now()
       WHERE id = $1 AND status IN ('queued', 'processing')
       RETURNING id`,
      [id],
    );
    return result.rows.length > 0;
  }

  async markCompleted(id: string, result: AnalysisResult): Promise<void> {
    await this.databaseService.query(
      `UPDATE public.analysis_jobs
       SET status = 'completed', result = $2::jsonb, completed_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, JSON.stringify(result)],
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.databaseService.query(
      `UPDATE public.analysis_jobs
       SET status = 'failed', error = $2, failed_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, error],
    );
  }

  async findById(
    id: string,
  ): Promise<{ id: string; status: AnalysisJobStatus } | null> {
    const result = await this.databaseService.query<{
      id: string;
      status: AnalysisJobStatus;
    }>(`SELECT id, status FROM public.analysis_jobs WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }
}
