import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { TenantFeatures } from './entities/tenant.entity';
import {
  getDefaultPlanFeatures,
  isValidPlan,
} from 'src/config/plan-features.config';
import { getEntitlementsConfig } from 'src/config/entitlements.config';
import {
  FeatureOverride,
  mapOverrideRow,
} from './entities/feature-override.entity';

interface CachedFeatures {
  data: TenantFeatures;
  expires: number;
}

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name);
  private featureCache = new Map<string, CachedFeatures>();
  private readonly cacheTtlMs: number;

  constructor(private readonly databaseService: DatabaseService) {
    this.cacheTtlMs = getEntitlementsConfig().featuresCacheTtlMs;
  }

  /**
   * Get default features for a specific plan
   */
  getDefaultFeatures(
    plan:
      | 'early_access'
      | 'basic'
      | 'pro'
      | 'enterprise'
      | 'navigator'
      | 'shield'
      | 'general_counsel'
      | 'infrastructure',
  ): TenantFeatures {
    return getDefaultPlanFeatures(plan);
  }

  /**
   * Get active (non-expired) overrides for a tenant from the normalized table
   */
  async getActiveOverrides(tenantId: string): Promise<FeatureOverride[]> {
    try {
      const result = await this.databaseService.query(
        `SELECT id, tenant_id, feature_key, value, granted_by, granted_at, reason, expires_at, created_at, updated_at
         FROM public.tenant_feature_overrides
         WHERE tenant_id = $1
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [tenantId],
      );
      return result.rows.map(mapOverrideRow);
    } catch (error) {
      this.logger.error(
        `Failed to get active overrides for tenant ${tenantId}: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to retrieve overrides');
    }
  }

  /**
   * Invalidate feature cache for a tenant
   */
  invalidateCache(tenantId: string): void {
    const keysToDelete: string[] = [];
    for (const [key] of this.featureCache) {
      if (key.startsWith(tenantId)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.featureCache.delete(key);
    }
    this.logger.debug(`Invalidated cache for tenant ${tenantId}`);
  }

  /**
   * Clean up stale cache entries (for cron job)
   */
  cleanupStaleCache(): number {
    const now = Date.now();
    let cleaned = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.featureCache.entries()) {
      if (entry.expires < now) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.featureCache.delete(key);
      cleaned++;
    }

    return cleaned;
  }

  /**
   * Get tenant's effective features (plan defaults merged with custom overrides)
   * Custom features in the database override default plan features
   * Merge order: Plan defaults <- Normalized overrides <- Legacy JSONB (for backward compat)
   */
  async getTenantFeatures(tenantId: string): Promise<TenantFeatures> {
    const cacheKey = tenantId;
    const cached = this.featureCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      this.logger.debug(`Returning cached features for tenant ${tenantId}`);
      return cached.data;
    }

    try {
      this.logger.debug(`Getting features for tenant: ${tenantId}`);

      const result = await this.databaseService.query(
        'SELECT id, plan, features FROM public.tenants WHERE id = $1 AND is_active = true',
        [tenantId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

      const { plan, features: legacyFeatures } = result.rows[0];
      const planValue = String(plan);

      if (!isValidPlan(planValue)) {
        this.logger.error(`Invalid plan "${planValue}" for tenant ${tenantId}`);
        throw new InternalServerErrorException('Invalid tenant plan');
      }

      const defaultFeatures = this.getDefaultFeatures(planValue);

      const activeOverrides = await this.getActiveOverrides(tenantId);

      const normalizedOverrides: TenantFeatures = {};
      for (const override of activeOverrides) {
        normalizedOverrides[override.featureKey] = override.value;
      }

      const effectiveFeatures: TenantFeatures = {
        ...defaultFeatures,
        ...legacyFeatures,
        ...normalizedOverrides,
      };

      this.featureCache.set(cacheKey, {
        data: effectiveFeatures,
        expires: Date.now() + this.cacheTtlMs,
      });

      this.logger.debug(
        `Tenant ${tenantId} effective features:`,
        effectiveFeatures,
      );

      return effectiveFeatures;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(`Failed to get features for tenant ${tenantId}`, error);
      throw new InternalServerErrorException('Failed to retrieve features');
    }
  }

  /**
   * Check if a tenant has access to a specific feature
   */
  async checkFeatureAccess(
    tenantId: string,
    featureName: string,
  ): Promise<boolean> {
    try {
      const features = await this.getTenantFeatures(tenantId);

      // Check if feature exists and is enabled
      if (featureName in features) {
        const featureValue = features[featureName];

        // For boolean features, return the value
        if (typeof featureValue === 'boolean') {
          return featureValue;
        }

        // For numeric features (like document_limit), consider them "enabled" if > 0 or -1 (unlimited)
        if (typeof featureValue === 'number') {
          return featureValue !== 0;
        }

        // For other types, consider them enabled if truthy
        return !!featureValue;
      }

      // Feature not found, deny access
      this.logger.warn(
        `Feature "${featureName}" not found for tenant ${tenantId}`,
      );
      return false;
    } catch (error) {
      this.logger.error(
        `Error checking feature access for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get the document limit for a tenant
   * Returns -1 for unlimited, 0 for no access, or positive number for limit
   */
  async getDocumentLimit(tenantId: string): Promise<number> {
    try {
      const features = await this.getTenantFeatures(tenantId);
      // Use nullish coalescing to only default to 0 if undefined/null, not if explicitly 0
      return features.document_limit ?? 0;
    } catch (error) {
      this.logger.error(
        `Error getting document limit for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if tenant can upload more documents based on their limit
   */
  async checkDocumentLimit(
    tenantId: string,
    currentCount: number,
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    try {
      const limit = await this.getDocumentLimit(tenantId);

      // -1 means unlimited
      if (limit === -1) {
        return { allowed: true, limit, current: currentCount };
      }

      // Check if current count is below limit
      const allowed = currentCount < limit;

      return { allowed, limit, current: currentCount };
    } catch (error) {
      this.logger.error(
        `Error checking document limit for tenant ${tenantId}`,
        error,
      );
      throw error;
    }
  }
}
