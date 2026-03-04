import { DatabaseService, QueryOptions } from '@lib/database';
import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  EntitlementSnapshot,
  PlanKey,
  ResolvedEntitlements,
} from '../../../common/types/entitlement.types';
import { EntitlementSnapshotsRepository } from '../../../repositories/entitlements/entitlement-snapshots.repository';
import { SubscriptionsRepository } from '../../../repositories/subscriptions/subscriptions.repository';
import { DomainEventsService } from './domain-events.service';

/**
 * Entitlement Snapshot Service - Phase 8
 *
 * Core service for managing entitlement snapshots (performance cache).
 *
 * Key responsibilities:
 * - Create snapshots of computed effective entitlements
 * - Serve cached snapshots for fast reads (hot path optimization)
 * - Invalidate snapshots when entitlements change (plan change, addon change, override change)
 * - Detect stale snapshots and trigger rebuilds
 * - Maintain snapshot history for auditing
 *
 * Architecture:
 * - Snapshots are a performance cache, NOT source of truth
 * - Source of truth: plan + addons + overrides (computed by EntitlementResolverService)
 * - Snapshots auto-create on first read (lazy initialization)
 * - Snapshots auto-invalidate on staleness (max age: 24 hours)
 * - Invalidation is synchronous (within plan-change transaction)
 *
 * Circular Dependency Avoidance:
 * - This service does NOT inject EntitlementResolverService
 * - Instead, EntitlementResolverService injects this service
 * - This service receives pre-computed entitlements from the resolver
 * - The resolver calls this service for caching, this service doesn't call the resolver
 *
 * TODO: BullMQ - After invalidation, queue a background job to rebuild the snapshot
 * for warm cache. This keeps the invalidation synchronous (fast) while pre-warming
 * the cache asynchronously.
 *
 * Example BullMQ integration:
 * ```typescript
 * await this.snapshotQueue.add('rebuild-snapshot', {
 *   tenantId,
 *   reason: 'plan_changed',
 * });
 * ```
 */
@Injectable()
export class EntitlementSnapshotService {
  private readonly logger = new Logger(EntitlementSnapshotService.name);

  // Max age for snapshots (24 hours)
  private readonly MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly snapshotsRepository: EntitlementSnapshotsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly domainEventsService: DomainEventsService,
  ) {}

  /**
   * Get cached snapshot or return null if not found or stale
   *
   * This is the hot path for entitlement resolution. It checks for a fresh
   * snapshot and returns it if available. If not found or stale, returns null.
   *
   * The caller (EntitlementResolverService) is responsible for computing fresh
   * entitlements and calling createSnapshot() if this returns null.
   *
   * @param tenantId - Tenant ID
   * @param options - Query options
   * @returns Snapshot data if fresh, null otherwise
   */
  async getOrNull(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<{
    entitlements: ResolvedEntitlements;
    plan: PlanKey;
  } | null> {
    const execute = async (client: PoolClient) => {
      // Find active snapshot
      const snapshot = await this.snapshotsRepository.findActive(tenantId, {
        client,
      });

      if (!snapshot) {
        this.logger.debug(`No active snapshot for tenant: ${tenantId}`);
        return null;
      }

      // Check if stale
      if (this.isStale(snapshot)) {
        this.logger.debug(
          `Snapshot is stale for tenant: ${tenantId}, age: ${this.getSnapshotAgeMs(snapshot)}ms`,
        );

        // Auto-invalidate stale snapshot
        await this.snapshotsRepository.invalidate(tenantId, { client });

        return null;
      }

      this.logger.debug(`Serving fresh snapshot for tenant: ${tenantId}`);

      // Extract plan key from snapshot metadata
      const planKey = (snapshot.snapshot_data as any).__plan_key as PlanKey; // Safe: __plan_key set by resolver from tenant.plan (validated by FK)

      return {
        entitlements: snapshot.snapshot_data as ResolvedEntitlements,
        plan: planKey,
      };
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Create a new snapshot for a tenant
   *
   * Stores pre-computed effective entitlements as a JSONB snapshot.
   * This method is called by EntitlementResolverService after computing
   * entitlements from plan + addons + overrides.
   *
   * Flow:
   * 1. Invalidate any existing active snapshot
   * 2. Get current subscription (for linking)
   * 3. Create new snapshot row with computed entitlements
   * 4. Emit domain event
   *
   * @param tenantId - Tenant ID
   * @param entitlements - Pre-computed effective entitlements
   * @param planKey - Current plan key
   * @param options - Query options
   * @returns The created snapshot
   */
  async createSnapshot(
    tenantId: string,
    entitlements: ResolvedEntitlements,
    planKey: PlanKey,
    options?: QueryOptions,
  ): Promise<EntitlementSnapshot> {
    const execute = async (client: PoolClient) => {
      this.logger.debug(`Creating snapshot for tenant: ${tenantId}`);

      // Step 0: Acquire advisory lock to prevent concurrent snapshot creation (Edge Case 1)
      // Serializes concurrent cold-path requests for the same tenant
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [
        `entitlement_snapshot:${tenantId}`,
      ]);

      // Step 1: Invalidate existing snapshot
      await this.snapshotsRepository.invalidate(tenantId, { client });

      // Step 2: Get current subscription
      const subscription =
        await this.subscriptionsRepository.findActiveByTenant(tenantId, {
          client,
        });

      // Step 3: Create snapshot with plan key embedded in snapshot_data
      const snapshotData = {
        ...entitlements,
        __plan_key: planKey, // Embed plan key for quick access
      };

      const snapshot = await this.snapshotsRepository.create(
        {
          tenant_id: tenantId,
          snapshot_data: JSON.stringify(snapshotData),
          subscription_id: subscription?.id,
          valid_from: new Date(),
        },
        { client },
      );

      // Step 4: Emit domain event
      await this.domainEventsService.emit(
        {
          tenant_id: tenantId,
          event_type: 'entitlement.snapshot_created',
          aggregate_type: 'entitlement',
          aggregate_id: snapshot.id,
          actor_type: 'system',
          payload: JSON.stringify({
            snapshot_id: snapshot.id,
            subscription_id: subscription?.id,
            plan_key: planKey,
            feature_count: Object.keys(entitlements).length,
          }),
          metadata: JSON.stringify({
            timestamp: new Date().toISOString(),
          }),
        },
        { client },
      );

      this.logger.log(
        `Snapshot created: id=${snapshot.id}, tenant=${tenantId}, features=${Object.keys(entitlements).length}`,
      );

      return snapshot;
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Invalidate current snapshot for a tenant
   *
   * Marks the current active snapshot as invalidated. The next call to
   * getOrNull() will return null, triggering a fresh compute.
   *
   * This is called by:
   * - SubscriptionsService.changePlan() (already implemented)
   * - TenantAddonsService when addons are added/removed/updated
   * - TenantOverridesService when overrides are applied/revoked/updated
   *
   * @param tenantId - Tenant ID
   * @param reason - Optional reason for invalidation
   * @param options - Query options
   */
  async invalidate(
    tenantId: string,
    reason?: string,
    options?: QueryOptions,
  ): Promise<void> {
    const execute = async (client: PoolClient) => {
      this.logger.debug(
        `Invalidating snapshot for tenant: ${tenantId}, reason: ${reason ?? 'none'}`,
      );

      await this.snapshotsRepository.invalidate(tenantId, { client });

      // Emit domain event
      await this.domainEventsService.emit(
        {
          tenant_id: tenantId,
          event_type: 'entitlement.snapshot_invalidated',
          aggregate_type: 'entitlement',
          aggregate_id: tenantId,
          actor_type: 'system',
          payload: JSON.stringify({
            reason: reason ?? 'manual',
          }),
          metadata: JSON.stringify({
            timestamp: new Date().toISOString(),
          }),
        },
        { client },
      );

      this.logger.log(`Snapshot invalidated: tenant=${tenantId}`);

      // TODO: BullMQ - Queue background rebuild for warm cache
      // await this.snapshotQueue.add('rebuild-snapshot', {
      //   tenantId,
      //   reason: reason ?? 'invalidated',
      // });
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Rebuild snapshot (invalidate + create in one transaction)
   *
   * This is a convenience method for explicit snapshot rebuilds.
   * It invalidates the current snapshot and creates a new one atomically.
   *
   * Note: This method requires pre-computed entitlements to be passed in.
   * The caller (EntitlementResolverService) computes them first, then calls this.
   *
   * @param tenantId - Tenant ID
   * @param entitlements - Pre-computed effective entitlements
   * @param planKey - Current plan key
   * @param options - Query options
   * @returns The new snapshot
   */
  async rebuild(
    tenantId: string,
    entitlements: ResolvedEntitlements,
    planKey: PlanKey,
    options?: QueryOptions,
  ): Promise<EntitlementSnapshot> {
    const execute = async (client: PoolClient) => {
      this.logger.debug(`Rebuilding snapshot for tenant: ${tenantId}`);

      // Invalidate + create in same transaction
      return this.createSnapshot(tenantId, entitlements, planKey, { client });
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Check if a snapshot is stale
   *
   * A snapshot is stale if:
   * - It's older than MAX_SNAPSHOT_AGE_MS (24 hours)
   *
   * Stale snapshots are auto-invalidated on next read.
   *
   * @param snapshot - Snapshot to check
   * @returns True if stale, false otherwise
   */
  isStale(snapshot: EntitlementSnapshot): boolean {
    const age = this.getSnapshotAgeMs(snapshot);
    return age > this.MAX_SNAPSHOT_AGE_MS;
  }

  /**
   * Get snapshot age in milliseconds
   *
   * @param snapshot - Snapshot to check
   * @returns Age in milliseconds
   */
  private getSnapshotAgeMs(snapshot: EntitlementSnapshot): number {
    return Date.now() - snapshot.valid_from.getTime();
  }

  /**
   * Get snapshot history for a tenant
   *
   * Returns all snapshots (active + invalidated) for auditing.
   *
   * @param tenantId - Tenant ID
   * @param limit - Max snapshots to return (default 10)
   * @param options - Query options
   * @returns Snapshot history ordered by created_at DESC
   */
  async getHistory(
    tenantId: string,
    limit: number = 10,
    options?: QueryOptions,
  ): Promise<EntitlementSnapshot[]> {
    const execute = async (client: PoolClient) => {
      return this.snapshotsRepository.findHistory(tenantId, limit, { client });
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Get active snapshot count (should always be 0 or 1)
   *
   * This is a safety check to ensure the unique constraint is working.
   *
   * @param tenantId - Tenant ID
   * @param options - Query options
   * @returns Count of active snapshots (should be 0 or 1)
   */
  async getActiveCount(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<number> {
    const execute = async (client: PoolClient) => {
      return this.snapshotsRepository.countActive(tenantId, { client });
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }
}
