import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export type GenerationJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface GenerationJobRow {
  id: string;
  tenant_id: string;
  status: GenerationJobStatus;
  job_type: 'preview' | 'generate';
  template_id: string;
  template_version_id: string;
  /** From template_versions: the S3 folder of the template DOCX. */
  template_version: string;
  variables: Record<string, unknown>;
  created_by: string;
}

/**
 * generation_jobs has RLS with FORCE ROW LEVEL SECURITY. Every query runs in the job's tenant
 * context (from the payload), so a job of any other tenant is neither seen nor changed.
 * templates and template_versions are global (no RLS).
 */
@Injectable()
export class GenerationJobWriteRepository {
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
    tenantId: string,
    id: string,
    result: Record<string, unknown>,
    client?: PoolClient,
  ): Promise<void> {
    await this.run(tenantId, client, (c) =>
      c.query(
        `UPDATE public.generation_jobs
         SET status = 'completed', result = $2::jsonb, completed_at = now(), updated_at = now()
         WHERE id = $1`,
        [id, JSON.stringify(result)],
      ),
    );
  }

  async markFailed(tenantId: string, id: string, error: string): Promise<void> {
    await this.databaseService.transactionWithTenantContext(
      { tenantId },
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

  /** The job with everything it runs from; null when it isn't in this tenant. */
  async findById(
    tenantId: string,
    id: string,
  ): Promise<GenerationJobRow | null> {
    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        const result = await client.query<GenerationJobRow>(
          `SELECT j.id, j.tenant_id, j.status, j.job_type, j.template_id, j.template_version_id,
                  v.version AS template_version, j.variables, j.created_by
           FROM public.generation_jobs j
           JOIN public.template_versions v
             ON v.id = j.template_version_id AND v.template_id = j.template_id
           WHERE j.id = $1`,
          [id],
        );
        return result.rows[0] ?? null;
      },
    );
  }

  async getTemplateName(templateId: string): Promise<string | null> {
    const result = await this.databaseService.query<{ name: string }>(
      `SELECT name FROM public.templates WHERE id = $1`,
      [templateId],
    );
    return result.rows[0]?.name ?? null;
  }

  async linkDocumentToJob(
    tenantId: string,
    jobId: string,
    documentId: string,
    client?: PoolClient,
  ): Promise<void> {
    await this.run(tenantId, client, (c) =>
      c.query(
        `UPDATE public.generation_jobs SET document_id = $2, updated_at = now() WHERE id = $1`,
        [jobId, documentId],
      ),
    );
  }

  /** Runs in the caller's (tenant-context) transaction when given one, else in its own. */
  private run<T>(
    tenantId: string,
    client: PoolClient | undefined,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return client
      ? work(client)
      : this.databaseService.transactionWithTenantContext({ tenantId }, work);
  }
}
