import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

/** A document the sweep erased, and its file (if it had one) to remove from storage. */
export interface ErasedDocument {
  id: string;
  s3Bucket: string | null;
  s3Key: string | null;
}

/**
 * Housekeeping across tenants for the daily retention sweep, so every query uses the platform-admin
 * context.
 */
@Injectable()
export class RetentionRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Deletes email-verification and password-reset tokens that expired more than 7 days ago. */
  async deleteExpiredTokens(): Promise<void> {
    await this.databaseService.transactionWithPlatformAdminContext((client) =>
      client.query('SELECT public.cleanup_expired_tokens()'),
    );
  }

  /** Marks pending invitations past their expiry as EXPIRED; returns how many. */
  async expireInvitations(): Promise<number> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) =>
        (
          await client.query<{ expired: number }>(
            'SELECT public.mark_expired_invitations() AS expired',
          )
        ).rows[0].expired,
    );
  }

  /**
   * Documents deleted more than `days` ago leave the trash: their text, structure and contract
   * variables, and their analysis results and generation variables, are erased (text-input content
   * and generated variables become empty values, which their constraints need). The row stays as
   * the record of who deleted what and when. Returns the files to remove from storage.
   */
  eraseTrashedDocuments(days: number): Promise<ErasedDocument[]> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) =>
        (
          await client.query<ErasedDocument>(
            `WITH erased AS (
               UPDATE public.documents
               SET erased_at = now(), updated_at = now(),
                   content = CASE WHEN source_type = 'text_input' THEN '' END,
                   content_structured = NULL,
                   generation_variables = CASE WHEN source_type = 'generated' THEN '{}'::jsonb END
               WHERE deleted_at IS NOT NULL
                 AND erased_at IS NULL
                 AND deleted_at <= now() - make_interval(days => $1)
               RETURNING id, s3_bucket, s3_key
             ), analyses AS (
               UPDATE public.analysis_jobs SET result = NULL, updated_at = now()
               WHERE document_id IN (SELECT id FROM erased)
             ), generations AS (
               UPDATE public.generation_jobs SET variables = '{}'::jsonb, updated_at = now()
               WHERE document_id IN (SELECT id FROM erased)
             )
             SELECT id, s3_bucket AS "s3Bucket", s3_key AS "s3Key" FROM erased`,
            [days],
          )
        ).rows,
    );
  }

  /**
   * Accounts their users deleted more than `days` ago are anonymized: names and the kept email are
   * erased (the login email is already a tombstone). The row and id stay, so past actions remain
   * attributed to an anonymous id. Returns how many.
   */
  async anonymizeDeletedAccounts(days: number): Promise<number> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) =>
        (
          await client.query(
            `UPDATE public.users
             SET first_name = NULL, last_name = NULL, deleted_email = NULL,
                 anonymized_at = now(), updated_at = now()
             WHERE deleted_at IS NOT NULL
               AND anonymized_at IS NULL
               AND deleted_at <= now() - make_interval(days => $1)`,
            [days],
          )
        ).rowCount ?? 0,
    );
  }

  /**
   * Uploads whose file was never confirmed within `days`: deleted and erased at once, with nothing
   * to restore (their quarantine objects expire by the S3 lifecycle rule). Returns their ids.
   */
  deleteAbandonedUploads(days: number): Promise<string[]> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) =>
        (
          await client.query<{ id: string }>(
            `UPDATE public.documents
             SET deleted_at = now(), erased_at = now(), updated_at = now(),
                 content_structured = NULL
             WHERE source_type = 'file_upload'
               AND extraction_status = 'pending'
               AND deleted_at IS NULL
               AND created_at < now() - make_interval(days => $1)
             RETURNING id`,
            [days],
          )
        ).rows.map((row) => row.id),
    );
  }
}
