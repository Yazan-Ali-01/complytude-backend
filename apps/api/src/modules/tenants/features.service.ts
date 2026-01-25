import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DatabaseService } from '@complytude/shared';
import { TenantFeatures } from './entities/tenant.entity';
import {
  getDefaultPlanFeatures,
  isValidPlan,
} from '../../config/plan-features.config';
import { PlanTier } from '@complytude/shared';
import { getEntitlementsConfig } from '../../config/entitlements.config';
import {
  FeatureOverride,
  mapOverrideRow,
} from './entities/feature-override.entity';
import {
  FeatureResponseDto,
  FeatureListResponseDto,
  CreateFeatureDto,
  UpdateFeatureDto,
  FeatureQueryDto,
} from './dto/feature.dto';
import {
  isLegacyFeature,
  getLegacyFeatureReplacement,
} from './entities/tenant-features.interface';

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name);
  private readonly cacheTtlMs: number;

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    const config = getEntitlementsConfig();
    this.cacheTtlMs = config.featuresCacheTtlMs;
  }

  /**
   * Get default features for a specific plan
   */
  getDefaultFeatures(plan: PlanTier): TenantFeatures {
    return getDefaultPlanFeatures(plan);
  }

  /**
   * Get active (non-expired) overrides for a tenant from the normalized table
   */
  async getActiveOverrides(tenantId: string): Promise<FeatureOverride[]> {
    try {
      const result = await this.databaseService.query(
        `SELECT id, tenant_id, feature_key, value, granted_by, granted_at, reason, expires_at, revoked_at, revoked_by, created_at, updated_at
         FROM public.tenant_feature_overrides
         WHERE tenant_id = $1
           AND revoked_at IS NULL
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
  async invalidateCache(tenantId: string): Promise<void> {
    await this.cacheManager.del(`features:${tenantId}`);
    this.logger.debug(`Invalidated cache for tenant ${tenantId}`);
  }

  /**
   * Get tenant's effective features (plan defaults merged with custom overrides)
   * Custom features in the database override default plan features
   * Merge order: Plan defaults <- Normalized overrides
   */
  async getTenantFeatures(tenantId: string): Promise<TenantFeatures> {
    const cacheKey = `features:${tenantId}`;
    const cached = await this.cacheManager.get<TenantFeatures>(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached features for tenant ${tenantId}`);
      return cached;
    }

    try {
      this.logger.debug(`Getting features for tenant: ${tenantId}`);

      const result = await this.databaseService.query(
        'SELECT id, plan FROM public.tenants WHERE id = $1 AND is_active = true',
        [tenantId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

      const { plan } = result.rows[0];
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

      // Merge features: plan defaults <- normalized overrides
      const effectiveFeatures: TenantFeatures = {
        ...defaultFeatures,
        ...normalizedOverrides,
      };

      await this.cacheManager.set(cacheKey, effectiveFeatures, this.cacheTtlMs);

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
      // Log deprecation warning for legacy features
      if (isLegacyFeature(featureName)) {
        const replacement = getLegacyFeatureReplacement(featureName);
        this.logger.warn(
          `DEPRECATION: Feature '${featureName}' is deprecated. ${replacement ? `Use '${replacement}' instead.` : 'This feature will be removed in a future version.'}`,
        );
      }

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
   * @deprecated Use documents_per_month with usage tracking instead
   */
  async getDocumentLimit(tenantId: string): Promise<number> {
    this.logger.warn(
      `DEPRECATION: getDocumentLimit() uses legacy 'document_limit' feature. Migrate to 'documents_per_month' with usage tracking.`,
    );
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

  // ========================
  // Feature Registry (Admin)
  // ========================

  /**
   * List all features from the registry with optional filtering
   */
  async listFeatures(query: FeatureQueryDto): Promise<FeatureListResponseDto> {
    let sql = 'SELECT * FROM public.features WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.category) {
      sql += ` AND category = $${paramIndex++}`;
      params.push(query.category);
    }
    if (query.isMetered !== undefined) {
      sql += ` AND is_metered = $${paramIndex++}`;
      params.push(query.isMetered);
    }

    sql += ' ORDER BY sort_order ASC';
    sql += ` LIMIT $${paramIndex++}`;
    params.push(query.limit || 100);

    const result = await this.databaseService.query(sql, params);

    return {
      features: result.rows.map((f) => this.toFeatureResponseDto(f)),
      total: result.rows.length,
    };
  }

  /**
   * Get a single feature by key from the registry
   */
  async getFeatureByKey(key: string): Promise<FeatureResponseDto> {
    const result = await this.databaseService.query(
      'SELECT * FROM public.features WHERE key = $1',
      [key],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Feature '${key}' not found`);
    }

    return this.toFeatureResponseDto(result.rows[0]);
  }

  /**
   * Create a new feature in the registry
   */
  async createFeature(dto: CreateFeatureDto): Promise<FeatureResponseDto> {
    const existing = await this.databaseService.query(
      'SELECT key FROM public.features WHERE key = $1',
      [dto.key],
    );

    if (existing.rows.length > 0) {
      throw new BadRequestException(`Feature '${dto.key}' already exists`);
    }

    const result = await this.databaseService.query(
      `INSERT INTO public.features (key, data_type, category, display_name, description, enum_values, default_value, is_metered, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dto.key,
        dto.dataType,
        dto.category,
        dto.displayName,
        dto.description || null,
        dto.enumValues ? JSON.stringify(dto.enumValues) : null,
        dto.defaultValue !== undefined
          ? JSON.stringify(dto.defaultValue)
          : null,
        dto.isMetered ?? false,
        dto.sortOrder ?? 0,
      ],
    );

    return this.toFeatureResponseDto(result.rows[0]);
  }

  /**
   * Update a feature's display metadata (displayName, description, sortOrder)
   */
  async updateFeature(
    key: string,
    dto: UpdateFeatureDto,
  ): Promise<FeatureResponseDto> {
    const existing = await this.databaseService.query(
      'SELECT * FROM public.features WHERE key = $1',
      [key],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundException(`Feature '${key}' not found`);
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (dto.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      params.push(dto.displayName);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(dto.description);
    }
    if (dto.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      params.push(dto.sortOrder);
    }

    if (updates.length === 0) {
      return this.toFeatureResponseDto(existing.rows[0]);
    }

    params.push(key);
    const result = await this.databaseService.query(
      `UPDATE public.features SET ${updates.join(', ')} WHERE key = $${paramIndex} RETURNING *`,
      params,
    );

    return this.toFeatureResponseDto(result.rows[0]);
  }

  /**
   * Map a raw feature DB row to FeatureResponseDto.
   * JSONB columns are already parsed by the pg driver -- no JSON.parse needed.
   */
  private toFeatureResponseDto(feature: any): FeatureResponseDto {
    return {
      key: feature.key,
      dataType: feature.data_type,
      category: feature.category,
      displayName: feature.display_name,
      description: feature.description,
      enumValues: feature.enum_values ?? null,
      defaultValue: feature.default_value ?? null,
      isMetered: feature.is_metered,
      sortOrder: feature.sort_order,
    };
  }
}
