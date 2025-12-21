import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { TenantFeatures } from './entities/tenant.entity';
import {
  getDefaultPlanFeatures,
  isValidPlan,
} from '../../core/features/plan-features.config';

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Get default features for a specific plan
   */
  getDefaultFeatures(
    plan: 'early_access' | 'basic' | 'pro' | 'enterprise',
  ): TenantFeatures {
    return getDefaultPlanFeatures(plan);
  }

  /**
   * Get tenant's effective features (plan defaults merged with custom overrides)
   * Custom features in the database override default plan features
   */
  async getTenantFeatures(tenantId: string): Promise<TenantFeatures> {
    try {
      // 🔍 DEBUG: Log the query being executed
      this.logger.log(`🔍 [DEBUG] Getting features for tenant: ${tenantId}`);

      const result = await this.databaseService.query(
        'SELECT plan, features FROM public.tenants WHERE tenant_id = $1 AND is_active = true',
        [tenantId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

      const { plan, features: customFeatures } = result.rows[0];

      // 🔍 DEBUG: Log raw database values
      this.logger.log(`🔍 [DEBUG] Raw DB values for tenant ${tenantId}:`, {
        plan: plan,
        customFeatures: customFeatures,
        customFeaturesType: typeof customFeatures,
        customFeaturesStringified: JSON.stringify(customFeatures),
      });

      // Validate plan type
      const planValue = String(plan);
      if (!isValidPlan(planValue)) {
        this.logger.error(`Invalid plan "${planValue}" for tenant ${tenantId}`);
        throw new InternalServerErrorException('Invalid tenant plan');
      }

      // Get default features for the plan
      const defaultFeatures = this.getDefaultFeatures(planValue);

      // 🔍 DEBUG: Log plan defaults
      this.logger.log(`🔍 [DEBUG] Plan defaults for ${planValue}:`, {
        defaultFeatures: defaultFeatures,
        document_limit: defaultFeatures.document_limit,
      });

      // Merge: custom features override defaults
      const effectiveFeatures: TenantFeatures = {
        ...defaultFeatures,
        ...customFeatures,
      };

      // 🔍 DEBUG: Log the merge process
      this.logger.log(`🔍 [DEBUG] Feature merge for tenant ${tenantId}:`, {
        defaultFeatures: defaultFeatures,
        customFeatures: customFeatures,
        effectiveFeatures: effectiveFeatures,
        finalDocumentLimit: effectiveFeatures.document_limit,
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
