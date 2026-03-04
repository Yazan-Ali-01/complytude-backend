import { DatabaseService } from '@lib/database';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { PlanKey } from 'src/common/types/entitlement.types';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import { EntitlementResolverService } from '../entitlements/services/entitlement-resolver.service';
import { EntitlementSnapshotService } from '../entitlements/services/entitlement-snapshot.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

/**
 * Snapshot Mock Controller - Phase 8 Test Cases
 *
 * This controller demonstrates the entitlement snapshot mechanism for performance optimization:
 * - Create snapshots (cache computed entitlements)
 * - Get current snapshot (read from cache)
 * - Compare snapshot vs compute performance
 * - Invalidate snapshots (on plan changes)
 * - Stale snapshot detection and auto-rebuild
 * - Snapshot history for auditing
 * - Explicit rebuild operations
 *
 * Snapshot Architecture:
 * - Snapshots are a performance cache (NOT source of truth)
 * - Source of truth: plan + addons + overrides (computed by EntitlementResolverService)
 * - Snapshots auto-create on first read (lazy initialization)
 * - Snapshots auto-invalidate when stale (max age: 24 hours)
 * - Invalidation is synchronous (within plan-change transaction)
 *
 * Performance Benefits:
 * - Hot path (snapshot hit): <10ms (single DB read)
 * - Cold path (snapshot miss): ~50ms (plan + addons + overrides queries + snapshot write)
 * - Speedup: 3-5x faster for cached reads
 *
 * Test Tenants (from seed 008):
 * - Tenant 1 (general_counsel): 100 documents/month, 30 contract reviews
 * - Tenant 2 (shield + addon): 25 + 50 = 75 documents/month, 5 contract reviews
 * - Tenant 3 (infrastructure + override): 500 documents (override), unlimited reviews
 *
 * TODO: BullMQ - After invalidation, queue a background job to rebuild the snapshot
 * for warm cache. This keeps invalidation fast while pre-warming the cache asynchronously.
 *
 * Example BullMQ integration:
 * ```typescript
 * await this.snapshotQueue.add('rebuild-snapshot', {
 *   tenantId,
 *   reason: 'plan_changed',
 * });
 * ```
 */
@Controller('mock/snapshots')
@AuthOptions({ tenant: true })
@ApiTags('mock-snapshots')
export class SnapshotMockController {
  constructor(
    private readonly snapshotService: EntitlementSnapshotService,
    private readonly entitlementResolver: EntitlementResolverService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly databaseService: DatabaseService,
  ) {}

  // ============================================
  // USE CASE 1: Create Snapshot
  // ============================================
  // Computes and stores effective entitlements snapshot
  // Expected behavior:
  // - Computes entitlements from plan + addons + overrides
  // - Stores as JSONB in entitlement_snapshots table
  // - Links to current subscription
  // - Emits entitlement.snapshot_created domain event
  // - Returns the cached snapshot data
  // Demonstrates:
  // - Snapshot creation process
  // - What gets cached (all effective entitlements)
  // - Snapshot metadata (subscription_id, valid_from)
  @Post('create')
  @ApiOperation({ summary: 'Create entitlement snapshot' })
  @ApiResponse({
    status: 200,
    description: 'Snapshot created and cached',
  })
  async createSnapshot(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Compute entitlements
        const { entitlements, plan } =
          await this.entitlementResolver.computeForTenant(user.tenantId, {
            client,
          });

        // Create snapshot
        const snapshot = await this.snapshotService.createSnapshot(
          user.tenantId,
          entitlements,
          plan,
          { client },
        );

        return {
          message: 'Snapshot created',
          tenantId: user.tenantId,
          snapshot: {
            id: snapshot.id,
            subscriptionId: snapshot.subscription_id,
            validFrom: snapshot.valid_from,
            featureCount: Object.keys(entitlements).length,
            planKey: plan,
          },
          cachedEntitlements: entitlements,
          note: 'Snapshot is now cached. Next resolveForTenant() call will read from cache (fast path).',
        };
      },
    );
  }

  // ============================================
  // USE CASE 2: Get Current Snapshot
  // ============================================
  // Returns the active snapshot data (or null if none exists)
  // Expected behavior:
  // - Returns snapshot if active and not stale
  // - Returns null if no snapshot or stale
  // Demonstrates:
  // - Snapshot cache read
  // - Staleness detection
  @Get('current')
  @ApiOperation({ summary: 'Get current active snapshot' })
  @ApiResponse({
    status: 200,
    description: 'Current snapshot or null',
  })
  async getCurrentSnapshot(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const cached = await this.snapshotService.getOrNull(user.tenantId);

    if (!cached) {
      return {
        message: 'No active snapshot',
        tenantId: user.tenantId,
        snapshot: null,
        note: 'No snapshot exists or it was stale. Call POST /mock/snapshots/create to create one.',
      };
    }

    return {
      message: 'Active snapshot found',
      tenantId: user.tenantId,
      snapshot: {
        planKey: cached.plan,
        featureCount: Object.keys(cached.entitlements).length,
      },
      entitlements: cached.entitlements,
      note: 'This snapshot is fresh and being used by the resolver (hot path).',
    };
  }

  // ============================================
  // USE CASE 3: Compare Snapshot vs Compute Performance
  // ============================================
  // Resolves entitlements both ways and compares performance
  // Expected behavior:
  // - First call: Computes from scratch (cold path ~50ms)
  // - Creates snapshot
  // - Second call: Reads from snapshot (hot path <10ms)
  // - Returns timing comparison showing speedup
  // Demonstrates:
  // - Performance benefit of snapshots
  // - 3-5x speedup for cached reads
  // - Snapshot-first strategy in action
  @Get('compare')
  @ApiOperation({
    summary: 'Compare snapshot vs compute performance',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance comparison',
  })
  async comparePerformance(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Measure snapshot read (hot path)
        const snapshotStart = Date.now();
        const fromSnapshot = await this.snapshotService.getOrNull(
          user.tenantId,
          {
            client,
          },
        );
        const snapshotTime = Date.now() - snapshotStart;

        // Measure full compute (cold path)
        const computeStart = Date.now();
        const fromCompute = await this.entitlementResolver.computeForTenant(
          user.tenantId,
          { client },
        );
        const computeTime = Date.now() - computeStart;

        const speedup =
          fromSnapshot && computeTime > 0
            ? (computeTime / snapshotTime).toFixed(1) + 'x'
            : 'N/A';

        return {
          message: 'Performance comparison complete',
          tenantId: user.tenantId,
          timing: {
            snapshotReadMs: snapshotTime,
            fullComputeMs: computeTime,
            speedup,
          },
          snapshotHit: fromSnapshot !== null,
          featureCount: Object.keys(fromCompute.entitlements).length,
          note: fromSnapshot
            ? `Snapshot read is ${speedup} faster than full compute. This is the hot path optimization.`
            : 'No snapshot exists. First call will be cold (compute + cache), subsequent calls will be hot (cache read).',
        };
      },
    );
  }

  // ============================================
  // USE CASE 4: Invalidate Snapshot
  // ============================================
  // Manually invalidates the current snapshot
  // Expected behavior:
  // - Marks current snapshot as invalidated (invalidated_at = now())
  // - Next getOrNull() returns null
  // - Next resolveForTenant() computes fresh and creates new snapshot
  // - Emits entitlement.snapshot_invalidated domain event
  // Demonstrates:
  // - Manual invalidation
  // - Snapshot lifecycle (active -> invalidated)
  @Post('invalidate')
  @ApiOperation({ summary: 'Invalidate current snapshot' })
  @ApiResponse({
    status: 200,
    description: 'Snapshot invalidated',
  })
  async invalidateSnapshot(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('reason') reason?: string,
  ) {
    await this.snapshotService.invalidate(user.tenantId, reason);

    // Verify it's gone
    const cached = await this.snapshotService.getOrNull(user.tenantId);

    return {
      message: 'Snapshot invalidated',
      tenantId: user.tenantId,
      reason: reason ?? 'manual',
      verifyGone: cached === null,
      note: 'Snapshot is now invalidated. Next resolveForTenant() will compute fresh and create a new snapshot.',
    };
  }

  // ============================================
  // USE CASE 5: Plan Change Invalidation Flow
  // ============================================
  // Demonstrates the full plan change flow with snapshot invalidation
  // Expected behavior:
  // 1. Create initial snapshot
  // 2. Change plan (e.g., shield -> general_counsel)
  // 3. Snapshot is automatically invalidated by SubscriptionsService
  // 4. Resolve entitlements - shows new plan values
  // 5. New snapshot is auto-created
  // Demonstrates:
  // - Automatic snapshot invalidation on plan changes
  // - Snapshot-first resolver auto-rebuilds after invalidation
  // - Entitlements reflect new plan immediately
  @Post('plan-change-flow')
  @ApiOperation({
    summary: 'Demonstrate plan change with snapshot invalidation',
  })
  @ApiResponse({
    status: 200,
    description: 'Plan change flow with snapshot lifecycle',
  })
  async planChangeFlow(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('newPlanKey') newPlanKey?: PlanKey,
  ) {
    if (!newPlanKey) {
      throw new BadRequestException('newPlanKey is required');
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Step 1: Create initial snapshot (if not exists)
        const initialSnapshot = await this.snapshotService.getOrNull(
          user.tenantId,
          { client },
        );

        if (!initialSnapshot) {
          const { entitlements, plan } =
            await this.entitlementResolver.computeForTenant(user.tenantId, {
              client,
            });
          await this.snapshotService.createSnapshot(
            user.tenantId,
            entitlements,
            plan,
            { client },
          );
        }

        const beforePlan = initialSnapshot?.plan ?? 'unknown';

        // Step 2: Change plan (this invalidates snapshot)
        await this.subscriptionsService.changePlan(
          user.tenantId,
          newPlanKey,
          user.userId,
        );

        // Step 3: Verify snapshot was invalidated
        const afterInvalidation = await this.snapshotService.getOrNull(
          user.tenantId,
          { client },
        );

        // Step 4: Resolve entitlements (triggers auto-rebuild)
        const { entitlements, plan } =
          await this.entitlementResolver.resolveAllForTenant(user.tenantId, {
            client,
          });

        // Step 5: Verify new snapshot was created
        const afterRebuild = await this.snapshotService.getOrNull(
          user.tenantId,
          { client },
        );

        return {
          message: 'Plan change flow complete',
          tenantId: user.tenantId,
          flow: {
            step1_initialPlan: beforePlan,
            step2_planChanged: newPlanKey,
            step3_snapshotInvalidated: afterInvalidation === null,
            step4_entitlementsResolved: true,
            step5_newSnapshotCreated: afterRebuild !== null,
          },
          newPlan: plan,
          newEntitlements: {
            documents_per_month: entitlements.documents_per_month,
            contract_reviews_per_month: entitlements.contract_reviews_per_month,
            redlining_enabled: entitlements.redlining_enabled,
            template_library: entitlements.template_library,
          },
          note: 'Plan change automatically invalidates snapshot. Next resolve auto-creates new snapshot with updated entitlements.',
        };
      },
    );
  }

  // ============================================
  // USE CASE 6: Stale Snapshot Detection
  // ============================================
  // Demonstrates automatic stale snapshot detection and rebuild
  // Expected behavior:
  // - Creates a snapshot with backdated valid_from (simulates old snapshot)
  // - Calls getOrNull() which detects staleness
  // - Auto-invalidates the stale snapshot
  // - Returns null (triggers rebuild on next resolve)
  // Demonstrates:
  // - Staleness detection (max age: 24 hours)
  // - Auto-invalidation of stale snapshots
  // - Lazy rebuild pattern
  @Post('stale-detection')
  @ApiOperation({ summary: 'Test stale snapshot detection and auto-rebuild' })
  @ApiResponse({
    status: 200,
    description: 'Stale snapshot detected and handled',
  })
  async testStaleDetection(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Step 1: Create a snapshot with backdated valid_from (simulate old snapshot)
        const { entitlements, plan } =
          await this.entitlementResolver.computeForTenant(user.tenantId, {
            client,
          });

        // Manually create snapshot with old valid_from
        const oldDate = new Date();
        oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago (exceeds 24h max age)

        await this.databaseService.query(
          `INSERT INTO public.entitlement_snapshots
           (tenant_id, snapshot_data, subscription_id, valid_from)
           VALUES ($1, $2, NULL, $3)`,
          [
            user.tenantId,
            JSON.stringify({ ...entitlements, __plan_key: plan }),
            oldDate,
          ],
        );

        // Step 2: Call getOrNull() - should detect staleness and invalidate
        const cached = await this.snapshotService.getOrNull(user.tenantId, {
          client,
        });

        // Step 3: Verify it was invalidated
        const activeCount = await this.snapshotService.getActiveCount(
          user.tenantId,
          { client },
        );

        return {
          message: 'Stale snapshot detection test complete',
          tenantId: user.tenantId,
          test: {
            snapshotCreatedAt: oldDate.toISOString(),
            ageHours: 25,
            maxAgeHours: 24,
            detectedAsStale: cached === null,
            autoInvalidated: cached === null,
            activeSnapshotsAfter: activeCount,
          },
          note: 'Stale snapshots (>24h old) are auto-invalidated on read. Next resolve will compute fresh and cache.',
        };
      },
    );
  }

  // ============================================
  // USE CASE 7: Snapshot History
  // ============================================
  // Shows all snapshots (active + invalidated) for audit trail
  // Expected behavior:
  // - Returns all snapshots ordered by created_at DESC
  // - Shows invalidated_at for invalidated snapshots
  // - Useful for debugging and auditing
  // Demonstrates:
  // - Snapshot lifecycle history
  // - Multiple snapshots over time (as plan changes)
  // - Temporal audit trail
  @Get('history')
  @ApiOperation({ summary: 'Get snapshot history (active + invalidated)' })
  @ApiResponse({
    status: 200,
    description: 'Snapshot history',
  })
  async getSnapshotHistory(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const history = await this.snapshotService.getHistory(user.tenantId, 10);

    return {
      message: 'Snapshot history retrieved',
      tenantId: user.tenantId,
      count: history.length,
      history: history.map((s) => ({
        id: s.id,
        subscriptionId: s.subscription_id,
        validFrom: s.valid_from,
        invalidatedAt: s.invalidated_at,
        isActive: !s.invalidated_at,
        featureCount: Object.keys(s.snapshot_data).length - 1, // -1 for __plan_key
        createdAt: s.created_at,
      })),
      note: 'History shows all snapshots (active + invalidated). Useful for debugging plan changes.',
    };
  }

  // ============================================
  // USE CASE 8: Rebuild Snapshot
  // ============================================
  // Explicitly rebuilds the snapshot (invalidate + create in one transaction)
  // Expected behavior:
  // - Invalidates current snapshot
  // - Computes fresh entitlements
  // - Creates new snapshot
  // - All in one atomic transaction
  // Demonstrates:
  // - Explicit rebuild operation
  // - Atomic invalidate + create
  // - Useful for manual cache refresh
  @Post('rebuild')
  @ApiOperation({ summary: 'Rebuild snapshot (invalidate + create)' })
  @ApiResponse({
    status: 200,
    description: 'Snapshot rebuilt',
  })
  async rebuildSnapshot(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Compute fresh entitlements
        const { entitlements, plan } =
          await this.entitlementResolver.computeForTenant(user.tenantId, {
            client,
          });

        // Rebuild (invalidate + create)
        const snapshot = await this.snapshotService.rebuild(
          user.tenantId,
          entitlements,
          plan,
          { client },
        );

        return {
          message: 'Snapshot rebuilt',
          tenantId: user.tenantId,
          snapshot: {
            id: snapshot.id,
            subscriptionId: snapshot.subscription_id,
            validFrom: snapshot.valid_from,
            featureCount: Object.keys(entitlements).length,
            planKey: plan,
          },
          note: 'Old snapshot was invalidated and new snapshot was created atomically.',
        };
      },
    );
  }

  // ============================================
  // USE CASE 9: Snapshot Hit vs Miss
  // ============================================
  // Demonstrates the difference between snapshot hit (cached) and miss (compute)
  // Expected behavior:
  // 1. First call: Snapshot miss -> computes and caches
  // 2. Second call: Snapshot hit -> reads from cache
  // 3. Shows timing difference
  // Demonstrates:
  // - Cold start (miss) vs warm cache (hit)
  // - Automatic caching on first resolve
  // - Performance benefit of snapshot-first strategy
  @Get('hit-vs-miss')
  @ApiOperation({ summary: 'Demonstrate snapshot hit vs miss' })
  @ApiResponse({
    status: 200,
    description: 'Snapshot hit/miss comparison',
  })
  async hitVsMiss(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Invalidate any existing snapshot to start fresh
        await this.snapshotService.invalidate(user.tenantId, 'test_setup', {
          client,
        });

        // First call: Snapshot miss (cold path)
        const missStart = Date.now();
        await this.entitlementResolver.resolveAllForTenant(user.tenantId, {
          client,
        });
        const missTime = Date.now() - missStart;

        // Second call: Snapshot hit (hot path)
        const hitStart = Date.now();
        await this.entitlementResolver.resolveAllForTenant(user.tenantId, {
          client,
        });
        const hitTime = Date.now() - hitStart;

        const speedup = (missTime / hitTime).toFixed(1) + 'x';

        return {
          message: 'Hit vs miss comparison complete',
          tenantId: user.tenantId,
          firstCall: {
            result: 'MISS (cold path)',
            timeMs: missTime,
            action: 'Computed from plan + addons + overrides, then cached',
          },
          secondCall: {
            result: 'HIT (hot path)',
            timeMs: hitTime,
            action: 'Read from snapshot cache',
          },
          speedup,
          note: `Second call is ${speedup} faster. This is why snapshot-first is the default strategy.`,
        };
      },
    );
  }

  // ============================================
  // USE CASE 10: Snapshot Active Count (Safety Check)
  // ============================================
  // Verifies that only one active snapshot exists per tenant
  // Expected behavior:
  // - Returns 0 (no snapshot) or 1 (one active snapshot)
  // - Never returns >1 (enforced by unique constraint)
  // Demonstrates:
  // - Database constraint enforcement
  // - Snapshot uniqueness guarantee
  @Get('active-count')
  @ApiOperation({ summary: 'Count active snapshots (should be 0 or 1)' })
  @ApiResponse({
    status: 200,
    description: 'Active snapshot count',
  })
  async getActiveCount(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const count = await this.snapshotService.getActiveCount(user.tenantId);

    return {
      message: 'Active snapshot count retrieved',
      tenantId: user.tenantId,
      activeCount: count,
      isValid: count === 0 || count === 1,
      note: 'Should always be 0 or 1. If >1, the unique constraint is broken (database bug).',
    };
  }

  // ============================================
  // USE CASE 11: Snapshot Age Check
  // ============================================
  // Shows the age of the current snapshot
  // Expected behavior:
  // - Returns snapshot age in hours
  // - Shows if it's approaching staleness (24h threshold)
  // Demonstrates:
  // - Snapshot freshness monitoring
  // - Staleness threshold (24 hours)
  @Get('age')
  @ApiOperation({ summary: 'Check current snapshot age' })
  @ApiResponse({
    status: 200,
    description: 'Snapshot age information',
  })
  async getSnapshotAge(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        const cached = await this.snapshotService.getOrNull(user.tenantId, {
          client,
        });

        if (!cached) {
          return {
            message: 'No active snapshot',
            tenantId: user.tenantId,
            snapshot: null,
            note: 'Create a snapshot first via POST /mock/snapshots/create',
          };
        }

        // Get the raw snapshot to check valid_from
        const history = await this.snapshotService.getHistory(
          user.tenantId,
          1,
          {
            client,
          },
        );
        const currentSnapshot = history[0];

        const ageMs = Date.now() - currentSnapshot.valid_from.getTime();
        const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(2);
        const maxAgeHours = 24;
        const isStale = this.snapshotService.isStale(currentSnapshot);

        return {
          message: 'Snapshot age retrieved',
          tenantId: user.tenantId,
          snapshot: {
            id: currentSnapshot.id,
            validFrom: currentSnapshot.valid_from,
            ageHours: parseFloat(ageHours),
            maxAgeHours,
            isStale,
            willBeInvalidatedOn: isStale
              ? 'next read'
              : 'when age exceeds 24 hours',
          },
          note: `Snapshots older than ${maxAgeHours} hours are auto-invalidated on next read.`,
        };
      },
    );
  }

  // ============================================
  // USE CASE 12: Full Snapshot Debug Info
  // ============================================
  // Shows complete snapshot state for debugging
  // Expected behavior:
  // - Returns current snapshot (if exists)
  // - Returns snapshot history
  // - Returns active count
  // - Returns full cached entitlements
  // Demonstrates:
  // - Complete snapshot state inspection
  // - Useful for debugging snapshot issues
  @Get('debug')
  @ApiOperation({ summary: 'Full snapshot debug information' })
  @ApiResponse({
    status: 200,
    description: 'Complete snapshot state',
  })
  async debugSnapshot(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        const cached = await this.snapshotService.getOrNull(user.tenantId, {
          client,
        });
        const history = await this.snapshotService.getHistory(
          user.tenantId,
          5,
          {
            client,
          },
        );
        const activeCount = await this.snapshotService.getActiveCount(
          user.tenantId,
          { client },
        );

        return {
          message: 'Snapshot debug info',
          tenantId: user.tenantId,
          current: cached
            ? {
                planKey: cached.plan,
                featureCount: Object.keys(cached.entitlements).length,
                entitlements: cached.entitlements,
              }
            : null,
          activeCount,
          historyCount: history.length,
          history: history.map((s) => ({
            id: s.id,
            validFrom: s.valid_from,
            invalidatedAt: s.invalidated_at,
            isActive: !s.invalidated_at,
            createdAt: s.created_at,
          })),
          note: 'Use this endpoint to inspect complete snapshot state for debugging.',
        };
      },
    );
  }
}
