import { EntitlementSnapshotRebuildJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { EntitlementResolverService } from '../services/entitlement-resolver.service';
import { EntitlementSnapshotService } from '../services/entitlement-snapshot.service';

/**
 * Snapshot Rebuild Handler
 *
 * Handles SNAPSHOT_REBUILD jobs enqueued after entitlement snapshot invalidation.
 * Pre-warms the cache by computing fresh entitlements and creating a new snapshot.
 */
@Injectable()
export class SnapshotRebuildHandler {
  private readonly logger = new Logger(SnapshotRebuildHandler.name);

  constructor(
    private readonly entitlementResolver: EntitlementResolverService,
    private readonly snapshotService: EntitlementSnapshotService,
  ) {}

  async execute(job: Job<EntitlementSnapshotRebuildJobData>): Promise<void> {
    const { tenantId, reason } = job.data;

    this.logger.debug(
      `Rebuilding snapshot: tenant=${tenantId} reason=${reason}`,
    );

    const { entitlements, plan, validUntil } =
      await this.entitlementResolver.computeForTenant(tenantId);

    await this.snapshotService.rebuild(
      tenantId,
      entitlements,
      plan,
      undefined,
      validUntil,
    );

    this.logger.log(
      `Snapshot rebuilt: tenant=${tenantId} featureCount=${Object.keys(entitlements).length}`,
    );
  }
}
