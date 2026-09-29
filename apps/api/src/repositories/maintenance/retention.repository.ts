import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

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
   * Uploads whose file was never confirmed within `days`: soft-deleted, the same way a user delete
   * is (their quarantine objects expire by the S3 lifecycle rule). Returns their ids.
   */
  deleteAbandonedUploads(days: number): Promise<string[]> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) =>
        (
          await client.query<{ id: string }>(
            `UPDATE public.documents
             SET deleted_at = now(), updated_at = now(), content_structured = NULL
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
