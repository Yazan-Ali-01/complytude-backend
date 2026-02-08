import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { DatabaseService } from '../../../database/database.service';
import { TenantAddonsRepository } from '../../../repositories/entitlements/tenant-addons.repository';
import { TenantOverridesRepository } from '../../../repositories/entitlements/tenant-overrides.repository';
import { TenantRepository } from '../../../repositories/tenants/tenant.repository';

/**
 * Entitlement Resolver Service
 *
 * Core engine for resolving effective entitlements from multiple sources:
 * - Plan entitlements (in-memory O(1) lookup)
 * - Add-on entitlements (database query)
 * - Admin overrides (database query)
 *
 * Merging precedence: override > plan + addons
 */
@Injectable()
export class EntitlementResolverService {
  private readonly logger = new Logger(EntitlementResolverService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
    private readonly tenantAddonsRepository: TenantAddonsRepository,
    private readonly tenantOverridesRepository: TenantOverridesRepository,
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
   * Resolve entitlement for a tenant and feature
   * Includes plan + addons + overrides
   *
   * @param tenantId - Tenant ID
   * @param featureKey - Feature key
   * @returns Effective entitlement or undefined if not found
   */
  async resolveForTenant(
    tenantId: string,
    featureKey: FeatureKey,
  ): Promise<EffectiveEntitlement | undefined> {
    return await this.databaseService.transactionWithTenantContext(
      tenantId,
      async (client) => {
        const tenant = await this.tenantRepository.findById(tenantId, {
          client,
        });
        if (!tenant) {
          this.logger.warn(`Tenant not found: ${tenantId}`);
          return undefined;
        }

        // Get plan entitlement (in-memory)
        const planEntitlement = this.resolve(tenant.plan, featureKey);
        if (!planEntitlement) {
          this.logger.warn(`Feature not found in plan: ${featureKey}`);
          return undefined;
        }

        // Get add-on entitlements (database query with JOIN, RLS-protected)
        const addons =
          await this.tenantAddonsRepository.findActiveByTenantAndFeature(
            tenantId,
            featureKey,
            { client },
          );

        // Get override (database query with JOIN, RLS-protected)
        const override =
          await this.tenantOverridesRepository.findActiveByTenantAndFeature(
            tenantId,
            featureKey,
            { client },
          );

        // Merge: plan + addons + override
        return this.merge(planEntitlement, addons, override);
      },
    );
  }

  /**
   * Resolve all entitlements for a tenant
   *
   * @param tenantId - Tenant ID
   * @returns Map of feature keys to effective entitlements
   *
   * TODO: Phase 4 - Refactor to accept QueryOptions parameter
   * This will allow callers to share a single transaction instead of creating nested transactions.
   * Pattern: async resolveAllForTenant(tenantId: string, options?: QueryOptions)
   * If no options.client provided, create transaction; otherwise use provided client.
   * This is important for atomic operations in Phase 4 (usage + credit deduction).
   */
  async resolveAllForTenant(
    tenantId: string,
  ): Promise<{ entitlements: ResolvedEntitlements; plan: PlanKey }> {
    // Wrap RLS-protected queries in transaction with tenant context
    return this.databaseService.transactionWithTenantContext(
      tenantId,
      async (client) => {
        // Get tenant's plan (no RLS needed for tenants table)
        const tenant = await this.tenantRepository.findById(tenantId, {
          client,
        });
        if (!tenant) {
          throw new NotFoundException(`Tenant ${tenantId} not found`);
        }

        // Get all plan entitlements (in-memory)
        const planEntitlements = getAllPlanEntitlements(tenant.plan);
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

            if (!existing) {
              // Add-on grants a feature not in plan
              resolved[featureKey] = {
                feature_key: featureKey,
                feature_type: featureDef.feature_type,
                value_bool: entitlement.value_bool,
                value_int: entitlement.value_int,
                value_text: entitlement.value_text,
                source: 'addon',
              };
            } else {
              // Merge with existing plan entitlement
              resolved[featureKey] = this.mergeValues(existing, {
                feature_key: featureKey,
                feature_type: featureDef.feature_type,
                value_bool: entitlement.value_bool,
                value_int: entitlement.value_int,
                value_text: entitlement.value_text,
                source: 'addon',
              });
            }
          }
        }

        // Get all active overrides (RLS-protected)
        const overrides =
          await this.tenantOverridesRepository.findActiveByTenant(tenantId, {
            client,
          });

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
        return { entitlements: resolved, plan: tenant.plan };
      },
    );
  }

  /**
   * Merge plan + addons + override
   *
   * @param plan - Plan entitlement
   * @param addons - Add-on entitlements
   * @param override - Admin override (highest precedence)
   * @returns Merged effective entitlement
   */
  private merge(
    plan: EffectiveEntitlement,
    addons: any[],
    override?: any,
  ): EffectiveEntitlement {
    // If override exists, it takes full precedence
    if (override) {
      return {
        feature_key: plan.feature_key,
        feature_type: plan.feature_type,
        value_bool: override.value_bool,
        value_int: override.value_int,
        value_text: override.value_text,
        source: 'override',
      };
    }

    // Start with plan entitlement
    let merged = { ...plan };

    // Merge add-ons
    for (const addon of addons) {
      for (const entitlement of addon.entitlements || []) {
        merged = this.mergeValues(merged, {
          feature_key: plan.feature_key,
          feature_type: plan.feature_type,
          value_bool: entitlement.value_bool,
          value_int: entitlement.value_int,
          value_text: entitlement.value_text,
          source: 'addon',
        });
      }
    }

    return merged;
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
