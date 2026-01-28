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

      const { maxOverridesPerTenant } = getEntitlementsConfig();

      const result = await this.databaseService.transaction(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [
          Buffer.from(tenantId.replace(/-/g, ''), 'hex').readBigInt64BE(0),
        ]);

        // Check if there's an active (non-revoked) override for this feature
        const existingOverride = await client.query(
          `SELECT id FROM public.tenant_feature_overrides
           WHERE tenant_id = $1 AND feature_key = $2 AND revoked_at IS NULL`,
          [tenantId, input.featureKey],
        );

        if (existingOverride.rows.length === 0) {
          // New override -- check limit
          const countResult = await client.query(
            `SELECT COUNT(*) as count FROM public.tenant_feature_overrides
             WHERE tenant_id = $1 AND revoked_at IS NULL`,
            [tenantId],
          );
          const currentCount = parseInt(String(countResult.rows[0].count), 10);

          if (currentCount >= maxOverridesPerTenant) {
            throw new BadRequestException(
              `Maximum overrides limit (${maxOverridesPerTenant}) reached for tenant ${tenantId}`,
            );
          }
        }

        // If existing active override, revoke it first (preserves audit trail)
        if (existingOverride.rows.length > 0) {
          await client.query(
            `UPDATE public.tenant_feature_overrides
             SET revoked_at = now(), revoked_by = $3, updated_at = now()
             WHERE tenant_id = $1 AND feature_key = $2 AND revoked_at IS NULL`,
            [tenantId, input.featureKey, grantedBy],
          );
        }

        // Insert new override
        const insertResult = await client.query(
          `INSERT INTO public.tenant_feature_overrides
            (tenant_id, feature_key, value, granted_by, reason, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)
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

        return insertResult.rows[0];
      });

      if (!result) {
        throw new InternalServerErrorException('Failed to create override');
      }

      this.logger.log(
        `Override granted for tenant ${tenantId}, feature: ${input.featureKey}`,
      );

      await this.featuresService.invalidateCache(tenantId);

      return mapOverrideRow(result as FeatureOverrideRow);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to grant override: ${(error as Error).message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to grant override');
    }
  }

  /**
   * Grant multiple overrides in a single transaction
   */
  async grantBulkOverrides(
    tenantId: string,
    inputs: CreateOverrideInput[],
    grantedBy: string,
  ): Promise<FeatureOverride[]> {
    try {
      // Validate all feature keys upfront
      for (const input of inputs) {
        const valid = await this.validateFeatureKey(input.featureKey);
        if (!valid) {
          throw new BadRequestException(
            `Invalid feature key: ${input.featureKey}`,
          );
        }
      }

      const result = await this.databaseService.transaction(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [
          Buffer.from(tenantId.replace(/-/g, ''), 'hex').readBigInt64BE(0),
        ]);

        // Revoke existing active overrides for the given feature keys
        const featureKeys = inputs.map((i) => i.featureKey);
        await client.query(
          `UPDATE public.tenant_feature_overrides
           SET revoked_at = now(), revoked_by = $2, updated_at = now()
           WHERE tenant_id = $1 AND feature_key = ANY($3) AND revoked_at IS NULL`,
          [tenantId, grantedBy, featureKeys],
        );

        // Build bulk INSERT with parameterized values
        const values: unknown[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;

        for (const input of inputs) {
          placeholders.push(
            `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`,
          );
          values.push(
            tenantId,
            input.featureKey,
            JSON.stringify(input.value),
            grantedBy,
            input.reason || null,
            input.expiresAt || null,
          );
        }

        const insertResult = await client.query(
          `INSERT INTO public.tenant_feature_overrides
            (tenant_id, feature_key, value, granted_by, reason, expires_at)
           VALUES ${placeholders.join(', ')}
           RETURNING *`,
          values,
        );

        return insertResult.rows;
      });

      this.logger.log(
        `${inputs.length} overrides granted for tenant ${tenantId}`,
      );

      await this.featuresService.invalidateCache(tenantId);

      return result.map((row) => mapOverrideRow(row as FeatureOverrideRow));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Failed to grant bulk overrides: ${(error as Error).message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to grant bulk overrides');
    }
  }

  /**
   * Soft-revoke an override (sets revoked_at instead of deleting)
   */
  async revokeOverride(
    tenantId: string,
    featureKey: string,
    revokedBy?: string,
  ): Promise<void> {
    try {
      const result = await this.databaseService.query(
        `UPDATE public.tenant_feature_overrides
         SET revoked_at = now(), revoked_by = $3, updated_at = now()
         WHERE tenant_id = $1 AND feature_key = $2 AND revoked_at IS NULL
         RETURNING id`,
        [tenantId, featureKey, revokedBy || null],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(
          `Active override not found for tenant ${tenantId}, feature: ${featureKey}`,
        );
      }

      this.logger.log(
        `Override revoked for tenant ${tenantId}, feature: ${featureKey}`,
      );

      await this.featuresService.invalidateCache(tenantId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to revoke override: ${(error as Error).message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to revoke override');
    }
  }

  async getTenantOverrides(
    tenantId: string,
    includeExpired = false,
    includeRevoked = false,
  ): Promise<FeatureOverride[]> {
    try {
      let query = `
        SELECT * FROM public.tenant_feature_overrides
        WHERE tenant_id = $1
      `;
      const params: (string | Date | null)[] = [tenantId];

      if (!includeRevoked) {
        query += ` AND revoked_at IS NULL`;
      }

      if (!includeExpired) {
        query += ` AND (expires_at IS NULL OR expires_at > NOW())`;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await this.databaseService.query(query, params);

      return result.rows.map(mapOverrideRow);
    } catch (error) {
      this.logger.error(
        `Failed to get overrides for tenant ${tenantId}: ${(error as Error).message}`,
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
           AND revoked_at IS NULL
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

  private async validateFeatureKey(featureKey: string): Promise<boolean> {
    try {
      const result = await this.databaseService.query(
        `SELECT key FROM public.features WHERE key = $1`,
        [featureKey],
      );
      return result.rows.length > 0;
    } catch (error) {
      this.logger.error(
        `Failed to validate feature key ${featureKey}: ${(error as Error).message}`,
        error,
      );
      return false;
    }
  }
}
