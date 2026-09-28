import { DatabaseService, QueryOptions } from '@lib/database';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  getAllPlanEntitlements,
  getFeatureDefinition,
  getPlanEntitlement,
} from '../../../common/constants/plan-entitlements.constant';
import {
  EffectiveEntitlement,
  FeatureKey,
  FeatureType,
  PlanKey,
  ResolvedEntitlements,
} from '../../../common/types/entitlement.types';
import { TenantAddonsRepository } from '../../../repositories/entitlements/tenant-addons.repository';
import { TenantOverridesRepository } from '../../../repositories/entitlements/tenant-overrides.repository';
import { SubscriptionsRepository } from '../../../repositories/subscriptions/subscriptions.repository';
import { EntitlementSnapshotService } from './entitlement-snapshot.service';

/**
 * Entitlement Resolver Service - Phase 8 Refactored
 *
 * Core engine for resolving effective entitlements with snapshot-first strategy.
 *
 * Architecture (Phase 8):
 * - Snapshot-first: Always check cache before computing
 * - Hot path: Read from snapshot (fast, <10ms)
 * - Cold path: Compute from plan + addons + overrides, then cache
 * - Auto-invalidation: Stale snapshots trigger rebuild
 *
 * Merging precedence: override > plan + addons
 *
 * Circular Dependency Avoidance:
 * - This service injects EntitlementSnapshotService
 * - EntitlementSnapshotService does NOT inject this service
 * - Snapshot service receives pre-computed entitlements from this service
 * - This service calls snapshot service for caching, not the other way around
 */
/** Feature types whose add-on grants add up (see mergeValues). */
const ADDITIVE_FEATURE_TYPES: ReadonlySet<string> = new Set([
  'quota',
  'metered',
  'capacity',
]);

/** An add-on's numeric grant times the quantity bought; unlimited (-1) stays unlimited. */
function addonValueForQuantity(
  valueInt: number | undefined,
  featureType: string,
  quantity: number,
): number | undefined {
  if (valueInt === undefined || valueInt === null || valueInt === -1) {
    return valueInt;
  }
  return ADDITIVE_FEATURE_TYPES.has(featureType)
    ? valueInt * Math.max(quantity, 1)
    : valueInt;
}

@Injectable()
export class EntitlementResolverService {
  private readonly logger = new Logger(EntitlementResolverService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly tenantAddonsRepository: TenantAddonsRepository,
    private readonly tenantOverridesRepository: TenantOverridesRepository,
    private readonly snapshotService: EntitlementSnapshotService,
  ) {}

  /**
   * Resolve entitlement for a plan and feature (O(1) in-memory lookup)
   *
   * @param planKey - Plan key (navigator, shield, general_counsel, infrastructure)
   * @param featureKey - Feature key (e.g., documents_per_month)
   * @returns Effective entitlement or undefined if not found
   */
  resolve(
    planKey: PlanKey,
    featureKey: FeatureKey,
  ): EffectiveEntitlement | undefined {
    const entitlement = getPlanEntitlement(planKey, featureKey);
    if (!entitlement) {
      return undefined;
    }

    const featureDef = getFeatureDefinition(featureKey);
    if (!featureDef) {
      return undefined;
    }

    return {
      feature_key: featureKey,
      feature_type: featureDef.feature_type,
      value_bool: entitlement.value_bool,
      value_int: entitlement.value_int,
      value_text: entitlement.value_text,
      source: 'plan',
    };
  }

  /**
   * Resolve entitlement for a tenant and feature (snapshot-first strategy)
   *
   * Phase 8 Refactored: Always checks snapshot cache first.
   *
   * Flow:
   * 1. Check snapshot cache via snapshotService.getOrNull()
   * 2. If fresh snapshot exists, return feature from snapshot (fast path <10ms)
   * 3. If no snapshot or stale, compute from scratch and cache
   *
   * @param tenantId - Tenant ID
   * @param featureKey - Feature key
   * @param options - Query options (optional client for shared transactions)
   * @returns Effective entitlement or undefined if not found
   */
  async resolveForTenant(
    tenantId: string,
    featureKey: FeatureKey,
    options?: QueryOptions,
  ): Promise<EffectiveEntitlement | undefined> {
    const execute = async (client: PoolClient) => {
      // Step 1: Check snapshot cache (hot path)
      const cached = await this.snapshotService.getOrNull(tenantId, { client });

      if (cached) {
        // Fast path: return from snapshot
        const entitlement = cached.entitlements[featureKey];
        if (entitlement) {
          this.logger.debug(
            `Resolved from snapshot: tenant=${tenantId}, feature=${featureKey}`,
          );
          return entitlement;
        }

        // Feature not in snapshot (shouldn't happen, but handle gracefully)
        this.logger.warn(
          `Feature ${featureKey} not found in snapshot for tenant ${tenantId}. Computing fresh.`,
        );
      }

      // Step 2: Cold path - compute from scratch
      const { entitlements, plan } = await this.computeForTenant(tenantId, {
        client,
      });

      // Step 3: Cache the computed entitlements
      await this.snapshotService.createSnapshot(tenantId, entitlements, plan, {
        client,
      });

      return entitlements[featureKey];
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
   * Resolve all entitlements for a tenant (snapshot-first strategy)
   *
   * Phase 8 Refactored: Always checks snapshot cache first.
   *
   * @param tenantId - Tenant ID
   * @param options - Query options (optional client for shared transactions)
   * @returns Map of feature keys to effective entitlements + plan key
   */
  async resolveAllForTenant(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<{ entitlements: ResolvedEntitlements; plan: PlanKey }> {
    const execute = async (client: PoolClient) => {
      // Step 1: Check snapshot cache (hot path)
      const cached = await this.snapshotService.getOrNull(tenantId, { client });

      if (cached) {
        this.logger.debug(`Resolved all from snapshot: tenant=${tenantId}`);
        return cached;
      }

      // Step 2: Cold path - compute from scratch
      const { entitlements, plan } = await this.computeForTenant(tenantId, {
        client,
      });

      // Step 3: Cache the computed entitlements
      await this.snapshotService.createSnapshot(tenantId, entitlements, plan, {
        client,
      });

      return { entitlements, plan };
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
   * Compute entitlements from plan + addons + overrides (no cache)
   *
   * This is the core computation logic extracted for use by the snapshot service.
   * It computes effective entitlements from scratch without checking the cache.
   *
   * Called by:
   * - resolveForTenant() when snapshot is missing or stale
   * - resolveAllForTenant() when snapshot is missing or stale
   * - EntitlementSnapshotService.createSnapshot() to build snapshots
   *
   * @param tenantId - Tenant ID
   * @param options - Query options
   * @returns Computed entitlements + plan key
   */
  async computeForTenant(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<{ entitlements: ResolvedEntitlements; plan: PlanKey }> {
    const execute = async (client: PoolClient) => {
      const subscription =
        await this.subscriptionsRepository.findActiveByTenantWithPlan(
          tenantId,
          { client },
        );
      if (!subscription) {
        throw new NotFoundException(
          `No active subscription found for tenant ${tenantId}`,
        );
      }
      if (!subscription.plan) {
        throw new NotFoundException(
          `Plan data missing for active subscription of tenant ${tenantId}`,
        );
      }

      // Plan is derived from tenant_subscriptions (source of truth), default to navigator
      const planKey = subscription.plan.key;

      // Get all plan entitlements (in-memory)
      const planEntitlements = getAllPlanEntitlements(planKey);
      const resolved: ResolvedEntitlements = {} as ResolvedEntitlements;

      // Convert plan entitlements to EffectiveEntitlement format
      for (const [featureKey, value] of Object.entries(planEntitlements)) {
        const featureDef = getFeatureDefinition(featureKey as FeatureKey);
        if (!featureDef) continue;

        resolved[featureKey] = {
          feature_key: featureKey,
          feature_type: featureDef.feature_type,
          value_bool: value.value_bool,
          value_int: value.value_int,
          value_text: value.value_text,
          source: 'plan',
        };
      }

      // Get all active add-ons with entitlements (single query with JOINs, RLS-protected)
      const addons =
        await this.tenantAddonsRepository.findActiveByTenantWithEntitlements(
          tenantId,
          { client },
        );

      // Merge add-on entitlements
      for (const addon of addons) {
        for (const entitlement of addon.entitlements) {
          const featureKey = entitlement.feature_key;
          const featureDef = getFeatureDefinition(featureKey);
          if (!featureDef) continue;

          const existing = resolved[featureKey];
          // Stripe bills quantity × price, so a numeric grant counts once per unit bought
          const valueInt = addonValueForQuantity(
            entitlement.value_int,
            featureDef.feature_type,
            addon.quantity,
          );

          if (!existing) {
            // Add-on grants a feature not in plan
            resolved[featureKey] = {
              feature_key: featureKey,
              feature_type: featureDef.feature_type,
              value_bool: entitlement.value_bool,
              value_int: valueInt,
              value_text: entitlement.value_text,
              source: 'addon',
            };
          } else {
            // Merge with existing plan entitlement
            resolved[featureKey] = this.mergeValues(existing, {
              feature_key: featureKey,
              feature_type: featureDef.feature_type,
              value_bool: entitlement.value_bool,
              value_int: valueInt,
              value_text: entitlement.value_text,
              source: 'addon',
            });
          }
        }
      }

      // Get all active overrides (RLS-protected)
      const overrides = await this.tenantOverridesRepository.findActiveByTenant(
        tenantId,
        {
          client,
        },
      );

      // Apply overrides (highest precedence)
      for (const override of overrides) {
        const featureKey = override.feature_key;
        const featureDef = getFeatureDefinition(featureKey);
        if (!featureDef) continue;

        resolved[featureKey] = {
          feature_key: featureKey,
          feature_type: featureDef.feature_type,
          value_bool: override.value_bool,
          value_int: override.value_int,
          value_text: override.value_text,
          source: 'override',
        };
      }

      return { entitlements: resolved, plan: planKey };
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
   * Merge two entitlement values based on feature type
   */
  private mergeValues(
    base: EffectiveEntitlement,
    addition: EffectiveEntitlement,
  ): EffectiveEntitlement {
    const featureType = base.feature_type;

    switch (featureType) {
      case 'boolean':
        // Boolean: OR logic (any true makes it true)
        return {
          ...base,
          value_bool: base.value_bool || addition.value_bool,
          source: addition.value_bool ? addition.source : base.source,
        };

      case 'quota':
      case 'metered':
      case 'capacity': {
        // Numeric: additive (plan + addon)
        const baseValue = base.value_int ?? 0;
        const addValue = addition.value_int ?? 0;

        // Handle unlimited (-1)
        if (baseValue === -1 || addValue === -1) {
          return {
            ...base,
            value_int: -1,
            source: baseValue === -1 ? base.source : addition.source,
          };
        }

        return {
          ...base,
          value_int: baseValue + addValue,
          source: 'addon', // Mixed source
        };
      }

      case 'rate_limit': {
        // Rate limit: use the higher limit
        const baseLimit = base.value_int ?? 0;
        const addLimit = addition.value_int ?? 0;

        if (baseLimit === -1 || addLimit === -1) {
          return {
            ...base,
            value_int: -1,
            source: baseLimit === -1 ? base.source : addition.source,
          };
        }

        return {
          ...base,
          value_int: Math.max(baseLimit, addLimit),
          source: addLimit > baseLimit ? addition.source : base.source,
        };
      }

      default:
        return base;
    }
  }

  /**
   * Get feature type for a feature key
   */
  getFeatureType(featureKey: FeatureKey): FeatureType | undefined {
    const featureDef = getFeatureDefinition(featureKey);
    return featureDef?.feature_type;
  }
}
