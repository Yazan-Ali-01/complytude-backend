import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export type GenerationJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * generation_jobs has RLS with FORCE ROW LEVEL SECURITY.
 * worker-generation has no tenant context, so all queries must use
 * transactionWithPlatformAdminContext to satisfy the is_platform_admin() policy.
 */
@Injectable()
export class GenerationJobWriteRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Atomically transitions the job to 'processing'.
   * Only succeeds when status is 'queued' (first attempt) or 'processing' (crash-recovery retry).
   * Returns true if this worker claimed the job, false if another worker beat it.
   */
  async markProcessing(id: string): Promise<boolean> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const result = await client.query<{ id: string }>(
          `UPDATE public.generation_jobs
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
    id: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await client.query(
          `UPDATE public.generation_jobs
           SET status = 'completed', result = $2::jsonb, completed_at = now(), updated_at = now()
           WHERE id = $1`,
          [id, JSON.stringify(result)],
        );
      },
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await client.query(
          `UPDATE public.generation_jobs
           SET status = 'failed', error = $2, failed_at = now(), updated_at = now()
           WHERE id = $1`,
          [id, error],
        );
      },
    );
  }

  async findById(
    id: string,
  ): Promise<{ id: string; status: GenerationJobStatus } | null> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const result = await client.query<{
          id: string;
          status: GenerationJobStatus;
        }>(`SELECT id, status FROM public.generation_jobs WHERE id = $1`, [id]);
        return result.rows[0] ?? null;
      },
    );
  }

  async getTemplateName(templateId: string): Promise<string | null> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const result = await client.query<{ name: string }>(
          `SELECT name FROM public.templates WHERE id = $1`,
          [templateId],
        );
        return result.rows[0]?.name ?? null;
      },
    );
  }

  async linkDocumentToJob(jobId: string, documentId: string): Promise<void> {
    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await client.query(
          `UPDATE public.generation_jobs SET document_id = $2, updated_at = now() WHERE id = $1`,
          [jobId, documentId],
        );
      },
    );
  }
}
