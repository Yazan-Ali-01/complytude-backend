import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PlanKey } from 'src/common/types/entitlement.types';
import {
  FEATURE_CATALOG,
  FeatureCatalogEntry,
  FeatureKey,
  PLAN_CATALOG,
  PLAN_ENTITLEMENTS,
  PlanCatalogEntry,
} from '../../../common/constants/plan-entitlements.constant';
import { DatabaseService } from '../../../database/database.service';
import { PlanEntitlementsRepository } from '../../../repositories/entitlements/plan-entitlements.repository';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { PlansRepository } from '../../../repositories/plans/plans.repository';

/**
 * Entitlement Sync Service
 *
 * Syncs features, plans, and plan entitlements from code constants to the database on app startup.
 * This ensures the database always reflects the current entitlement definitions in code.
 *
 * Sync Strategy:
 * - Features: Add new, update existing, soft-delete removed (set is_active = false)
 * - Plans: Add new, update existing, soft-delete removed (set is_active = false)
 * - Plan Entitlements: Sync complete matrix for each plan, remove orphaned entitlements
 *
 * Runs on every app startup via OnModuleInit (idempotent).
 *
 * Pattern follows TenantRbacSyncService.
 *
 * ARCHITECTURE CHANGE:
 * - Now uses Object.entries() to iterate FEATURE_CATALOG and PLAN_CATALOG
 * - Keys are extracted from object keys (not from entry.key property)
 * - O(1) catalog lookups instead of O(n) array scans
 */
@Injectable()
export class EntitlementSyncService implements OnModuleInit {
  private readonly logger = new Logger(EntitlementSyncService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly featuresRepository: FeaturesRepository,
    private readonly plansRepository: PlansRepository,
    private readonly planEntitlementsRepository: PlanEntitlementsRepository,
  ) {}

  async onModuleInit() {
    this.logger.log('Starting Entitlement sync...');
    await this.syncFeatures();
    await this.syncPlans();
    await this.syncPlanEntitlements();
    this.logger.log('Entitlement sync completed successfully');
  }

  /**
   * Sync features from code constants to database
   * Strategy: Add new, update existing, soft-delete removed
   */
  private async syncFeatures(): Promise<void> {
    await this.databaseService.transaction(async (client) => {
      const featureEntries = Object.entries(FEATURE_CATALOG);
      this.logger.log(
        `Syncing ${featureEntries.length} features to database...`,
      );

      // 1. Upsert each feature from code
      // Key is now extracted from object key, not from entry.key
      for (const [key, entry] of featureEntries) {
        // Cast to FeatureCatalogEntry to access optional properties safely
        const catalogEntry = entry as FeatureCatalogEntry;
        await this.featuresRepository.upsertByKey(
          {
            key: key as FeatureKey,
            name: catalogEntry.name,
            description: catalogEntry.description,
            feature_type: catalogEntry.feature_type,
            unit: catalogEntry.unit,
            creditable: catalogEntry.creditable ?? false,
            credit_cost: catalogEntry.credit_cost ?? null,
            is_active: true,
            metadata: '{}',
          },
          { client },
        );
      }

      // 2. Soft-delete features removed from code (set is_active = false)
      const codeKeys = Object.keys(FEATURE_CATALOG);
      const placeholders = codeKeys.map((_, i) => `$${i + 1}`).join(', ');

      const deactivateResult = await this.databaseService.query(
        `
        UPDATE public.features
        SET is_active = false, updated_at = now()
        WHERE key NOT IN (${placeholders})
          AND is_active = true
        RETURNING key
        `,
        codeKeys,
        true, // bypassRLS
      );

      if (deactivateResult.rows.length > 0) {
        const deactivatedKeys = deactivateResult.rows
          .map((row) => row.key)
          .join(', ');
        this.logger.warn(
          `Deactivated ${deactivateResult.rows.length} removed features: ${deactivatedKeys}`,
        );
      }

      this.logger.log('Features synced successfully');
    }, true); // bypassRLS: true for system operations
  }

  /**
   * Sync plans from code constants to database
   * Strategy: Add new, update existing, soft-delete removed
   */
  private async syncPlans(): Promise<void> {
    await this.databaseService.transaction(async (client) => {
      const planEntries = Object.entries(PLAN_CATALOG);
      this.logger.log(`Syncing ${planEntries.length} plans to database...`);

      // 1. Upsert each plan from code
      // Key is now extracted from object key, not from entry.key
      for (const [key, entry] of planEntries) {
        // Cast to PlanCatalogEntry for type safety
        const catalogEntry = entry as PlanCatalogEntry;
        await this.plansRepository.upsertByKey(
          {
            key: key as PlanKey,
            name: catalogEntry.name,
            description: catalogEntry.description,
            price_monthly: catalogEntry.price_monthly,
            price_currency: catalogEntry.price_currency,
            billing_period: catalogEntry.billing_period,
            is_active: true,
            sort_order: catalogEntry.sort_order,
            metadata: '{}',
          },
          { client },
        );
      }

      // 2. Soft-delete plans removed from code (set is_active = false)
      const codeKeys = Object.keys(PLAN_CATALOG);
      const placeholders = codeKeys.map((_, i) => `$${i + 1}`).join(', ');

      const deactivateResult = await this.databaseService.query(
        `
        UPDATE public.plans
        SET is_active = false, updated_at = now()
        WHERE key NOT IN (${placeholders})
          AND is_active = true
        RETURNING key
        `,
        codeKeys,
        true, // bypassRLS
      );

      if (deactivateResult.rows.length > 0) {
        const deactivatedKeys = deactivateResult.rows
          .map((row) => row.key)
          .join(', ');
        this.logger.warn(
          `Deactivated ${deactivateResult.rows.length} removed plans: ${deactivatedKeys}`,
        );
      }

      this.logger.log('Plans synced successfully');
    }, true); // bypassRLS: true for system operations
  }

  /**
   * Sync plan entitlements from code constants to database
   * Strategy: Sync complete matrix for each plan, remove orphaned entitlements
   */
  private async syncPlanEntitlements(): Promise<void> {
    await this.databaseService.transaction(async (client) => {
      const planKeys = Object.keys(PLAN_ENTITLEMENTS) as PlanKey[];
      this.logger.log(
        `Syncing plan entitlements for ${planKeys.length} plans...`,
      );

      const allSyncedEntitlementIds: string[] = [];

      for (const planKey of planKeys) {
        // Get plan ID from database
        const plan = await this.plansRepository.findByKey(planKey, { client });
        if (!plan) {
          this.logger.error(`Plan not found: ${planKey}`);
          continue;
        }

        // Get feature IDs for this plan's entitlements
        const entitlements = PLAN_ENTITLEMENTS[planKey];
        const featureKeys = Object.keys(entitlements) as FeatureKey[];

        const entitlementsToSync: Array<{
          plan_id: string;
          feature_id: string;
          value_bool: boolean | null;
          value_int: number | null;
          value_text: string | null;
          metadata: string;
        }> = [];

        for (const featureKey of featureKeys) {
          // Get feature ID from database
          const feature = await this.featuresRepository.findByKey(featureKey, {
            client,
          });
          if (!feature) {
            this.logger.error(`Feature not found: ${featureKey}`);
            continue;
          }

          const value = entitlements[featureKey];
          entitlementsToSync.push({
            plan_id: plan.id,
            feature_id: feature.id,
            value_bool: value.value_bool ?? null,
            value_int: value.value_int ?? null,
            value_text: value.value_text ?? null,
            metadata: '{}',
          });
        }

        // Bulk upsert entitlements for this plan
        if (entitlementsToSync.length > 0) {
          const syncedIds = await this.planEntitlementsRepository.syncForPlan(
            plan.id,
            entitlementsToSync,
            { client },
          );
          allSyncedEntitlementIds.push(...syncedIds);
        }

        this.logger.log(
          `Synced ${entitlementsToSync.length} entitlements for plan: ${planKey}`,
        );
      }

      // Remove orphaned entitlements (features or plans that no longer exist in code)
      if (allSyncedEntitlementIds.length > 0) {
        const placeholders = allSyncedEntitlementIds
          .map((_, i) => `$${i + 1}`)
          .join(', ');

        const deleteResult = await this.databaseService.query(
          `
          DELETE FROM public.plan_entitlements
          WHERE id NOT IN (${placeholders})
          RETURNING id
          `,
          allSyncedEntitlementIds,
          true, // bypassRLS
        );

        if (deleteResult.rows.length > 0) {
          this.logger.warn(
            `Removed ${deleteResult.rows.length} orphaned plan entitlements`,
          );
        }
      }

      this.logger.log('Plan entitlements synced successfully');
    }, true); // bypassRLS: true for system operations
  }
}
