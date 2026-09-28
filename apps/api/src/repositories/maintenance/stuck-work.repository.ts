import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface StuckGenerationJob {
  id: string;
  tenant_id: string;
  job_type: 'preview' | 'generate';
}

/**
 * Finds and fails work that stopped moving: rows a worker should have finished long ago (a job
 * lost to a Redis failure after the commit, stalled past BullMQ's retries, or a crashed worker).
 * Runs across tenants, so every query uses the platform-admin context.
 */
@Injectable()
export class StuckWorkRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Uploaded documents whose extraction started more than `minutes` ago and never finished. */
  failStuckDocumentExtractions(
    minutes: number,
    error: string,
  ): Promise<string[]> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) =>
        (
          await client.query<{ id: string }>(
            `UPDATE public.documents
             SET extraction_status = 'failed', extraction_error = $2, updated_at = now()
             WHERE extraction_status = 'processing'
               AND updated_at < now() - make_interval(mins => $1)
             RETURNING id`,
            [minutes, error],
          )
        ).rows.map((row) => row.id),
    );
  }

  failStuckAnalysisJobs(minutes: number, error: string): Promise<string[]> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) =>
        (
          await client.query<{ id: string }>(
            `UPDATE public.analysis_jobs
             SET status = 'failed', error = $2, failed_at = now(), updated_at = now()
             WHERE status IN ('queued', 'processing')
               AND updated_at < now() - make_interval(mins => $1)
             RETURNING id`,
            [minutes, error],
          )
        ).rows.map((row) => row.id),
    );
  }

  failStuckGenerationJobs(
    minutes: number,
    error: string,
  ): Promise<StuckGenerationJob[]> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) =>
        (
          await client.query<StuckGenerationJob>(
            `UPDATE public.generation_jobs
             SET status = 'failed', error = $2, failed_at = now(), updated_at = now()
             WHERE status IN ('queued', 'processing')
               AND updated_at < now() - make_interval(mins => $1)
             RETURNING id, tenant_id, job_type`,
            [minutes, error],
          )
        ).rows,
    );
  }
}
