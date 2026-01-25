import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import {
  FeatureOverride,
  CreateOverrideInput,
  mapOverrideRow,
  FeatureOverrideRow,
} from './entities/feature-override.entity';
import { FeaturesService } from './features.service';
import { getEntitlementsConfig } from 'src/config/entitlements.config';

@Injectable()
export class OverridesService {
  private readonly logger = new Logger(OverridesService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly featuresService: FeaturesService,
  ) {}

  async grantOverride(
    tenantId: string,
    input: CreateOverrideInput,
    grantedBy: string,
  ): Promise<FeatureOverride> {
    try {
      const validFeature = await this.validateFeatureKey(input.featureKey);
      if (!validFeature) {
        throw new BadRequestException(
          `Invalid feature key: ${input.featureKey}`,
        );
      }

      // Check if this would be a new override (not an update)
      const existingOverride = await this.databaseService.query(
        `SELECT id FROM public.tenant_feature_overrides
         WHERE tenant_id = $1 AND feature_key = $2`,
        [tenantId, input.featureKey],
      );

      if (existingOverride.rows.length === 0) {
        // This is a new override, check the limit
        const countResult = await this.databaseService.query(
          `SELECT COUNT(*) as count FROM public.tenant_feature_overrides
           WHERE tenant_id = $1`,
          [tenantId],
        );
        const currentCount = parseInt(String(countResult.rows[0].count), 10);
        const { maxOverridesPerTenant } = getEntitlementsConfig();

        if (currentCount >= maxOverridesPerTenant) {
          throw new BadRequestException(
            `Maximum overrides limit (${maxOverridesPerTenant}) reached for tenant ${tenantId}`,
          );
        }
      }

      const result = await this.databaseService.query(
        `INSERT INTO public.tenant_feature_overrides
          (tenant_id, feature_key, value, granted_by, reason, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, feature_key)
         DO UPDATE SET value = EXCLUDED.value, granted_by = EXCLUDED.granted_by,
                       granted_at = EXCLUDED.granted_at, reason = EXCLUDED.reason,
                       expires_at = EXCLUDED.expires_at, updated_at = now()
         RETURNING *`,
        [
          tenantId,
          input.featureKey,
          JSON.stringify(input.value),
          grantedBy,
          input.reason || null,
          input.expiresAt || null,
        ],
      );

      if (result.rows.length === 0) {
        throw new InternalServerErrorException('Failed to create override');
      }

      this.logger.log(
        `Override granted for tenant ${tenantId}, feature: ${input.featureKey}`,
      );

      this.featuresService.invalidateCache(tenantId);

      return mapOverrideRow(result.rows[0] as FeatureOverrideRow);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(`Failed to grant override: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to grant override');
    }
  }

  async revokeOverride(tenantId: string, featureKey: string): Promise<void> {
    try {
      const result = await this.databaseService.query(
        `DELETE FROM public.tenant_feature_overrides
         WHERE tenant_id = $1 AND feature_key = $2
         RETURNING id`,
        [tenantId, featureKey],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(
          `Override not found for tenant ${tenantId}, feature: ${featureKey}`,
        );
      }

      this.logger.log(
        `Override revoked for tenant ${tenantId}, feature: ${featureKey}`,
      );

      this.featuresService.invalidateCache(tenantId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to revoke override: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to revoke override');
    }
  }

  async getTenantOverrides(
    tenantId: string,
    includeExpired = false,
  ): Promise<FeatureOverride[]> {
    try {
      let query = `
        SELECT * FROM public.tenant_feature_overrides
        WHERE tenant_id = $1
      `;
      const params: (string | Date | null)[] = [tenantId];

      if (!includeExpired) {
        query += ` AND (expires_at IS NULL OR expires_at > NOW())`;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await this.databaseService.query(query, params);

      return result.rows.map(mapOverrideRow);
    } catch (error) {
      this.logger.error(
        `Failed to get overrides for tenant ${tenantId}: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to retrieve overrides');
    }
  }

  async getActiveOverride(
    tenantId: string,
    featureKey: string,
  ): Promise<FeatureOverride | null> {
    try {
      const result = await this.databaseService.query(
        `SELECT * FROM public.tenant_feature_overrides
         WHERE tenant_id = $1 AND feature_key = $2
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [tenantId, featureKey],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapOverrideRow(result.rows[0] as FeatureOverrideRow);
    } catch (error) {
      this.logger.error(
        `Failed to get override for tenant ${tenantId}, feature ${featureKey}: ${(error as Error).message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to retrieve override');
    }
  }

  async cleanupExpiredOverrides(): Promise<number> {
    try {
      const result = await this.databaseService.query(
        `DELETE FROM public.tenant_feature_overrides
         WHERE expires_at IS NOT NULL AND expires_at <= NOW()
         RETURNING id`,
      );

      const deletedCount = result.rows.length;
      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} expired overrides`);
      }

      return deletedCount;
    } catch (error) {
      this.logger.error(
        `Failed to cleanup expired overrides: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to cleanup expired overrides',
      );
    }
  }

  private async validateFeatureKey(featureKey: string): Promise<boolean> {
    try {
      const result = await this.databaseService.query(
        `SELECT key FROM public.features WHERE key = $1`,
        [featureKey],
      );
      return result.rows.length > 0;
    } catch (error) {
      this.logger.error(
        `Failed to validate feature key ${featureKey}: ${error.message}`,
        error,
      );
      return false;
    }
  }
}
