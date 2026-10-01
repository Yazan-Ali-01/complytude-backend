import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

/** Errors are stored for the platform admin who reads the version; no need for a whole trace. */
const MAX_ERROR_CHARS = 1000;

/**
 * A ruleset version's ingestion state (migration 040): the API activates only an ingested
 * version, so this is what makes a version usable.
 */
@Injectable()
export class RulesetVersionStatusRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Its chunks are stored, in the same transaction as the chunks themselves. */
  async markIngested(
    versionId: string,
    chunkCount: number,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `UPDATE public.ruleset_versions
       SET ingestion_status = 'ingested', chunk_count = $2, ingestion_error = NULL,
           ingested_at = now()
       WHERE id = $1`,
      [versionId, chunkCount],
    );
  }

  /**
   * Inactive versions of the ruleset (other than `keepVersionId`) whose chunks were just removed:
   * they have to be ingested again before they can be activated.
   */
  async resetEmptied(
    rulesetId: string,
    keepVersionId: string,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `UPDATE public.ruleset_versions
       SET ingestion_status = 'pending', chunk_count = NULL, ingested_at = NULL
       WHERE ruleset_id = $1 AND id <> $2 AND NOT is_active AND ingestion_status = 'ingested'`,
      [rulesetId, keepVersionId],
    );
  }

  /**
   * Ingestion gave up. A version that was ingested before keeps its chunks (the replace is
   * atomic) and stays ingested; only the error is recorded.
   */
  async markFailed(versionId: string, error: string): Promise<void> {
    await this.databaseService.query(
      `UPDATE public.ruleset_versions
       SET ingestion_error = $2,
           ingestion_status = CASE WHEN ingestion_status = 'ingested' THEN 'ingested' ELSE 'failed' END
       WHERE id = $1`,
      [versionId, error.slice(0, MAX_ERROR_CHARS)],
    );
  }
}
