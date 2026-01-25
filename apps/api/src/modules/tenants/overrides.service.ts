import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '@complytude/shared';
import {
  FeatureOverride,
  CreateOverrideInput,
  mapOverrideRow,
  FeatureOverrideRow,
} from './entities/feature-override.entity';
import { FeaturesService } from './features.service';
import { getEntitlementsConfig } from '../../config/entitlements.config';

interface FeatureDefinition {
  key: string;
  dataType: 'boolean' | 'number' | 'enum' | 'string';
  enumValues: string[] | null;
}

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
      const featureDefinition = await this.getFeatureDefinition(
        input.featureKey,
      );
      if (!featureDefinition) {
        throw new BadRequestException(
          `Invalid feature key: ${input.featureKey}`,
        );
      }

      // Validate value against feature's data type
      const validationError = this.validateFeatureValue(
        input.value,
        featureDefinition,
      );
      if (validationError) {
        throw new BadRequestException(validationError);
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

  /**
   * Soft-revoke expired overrides (cleanup job).
   * Expired overrides are already excluded from active queries,
   * but this marks them as revoked for a clean audit trail.
   */
  async cleanupExpiredOverrides(): Promise<number> {
    try {
      const result = await this.databaseService.query(
        `UPDATE public.tenant_feature_overrides
         SET revoked_at = now(), updated_at = now()
         WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND revoked_at IS NULL
         RETURNING id`,
      );

      const revokedCount = result.rows.length;
      if (revokedCount > 0) {
        this.logger.log(`Cleaned up ${revokedCount} expired overrides`);
      }

      return revokedCount;
    } catch (error) {
      this.logger.error(
        `Failed to cleanup expired overrides: ${(error as Error).message}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to cleanup expired overrides',
      );
    }
  }

  /**
   * Simple boolean check: does this feature key exist in the registry?
   */
  private async validateFeatureKey(featureKey: string): Promise<boolean> {
    return (await this.getFeatureDefinition(featureKey)) !== null;
  }

  /**
   * Get feature definition from the registry for type validation
   */
  private async getFeatureDefinition(
    featureKey: string,
  ): Promise<FeatureDefinition | null> {
    try {
      const result = await this.databaseService.query(
        `SELECT key, data_type, enum_values FROM public.features WHERE key = $1`,
        [featureKey],
      );
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0] as {
        key: string;
        data_type: FeatureDefinition['dataType'];
        enum_values: string | string[] | null;
      };
      return {
        key: row.key,
        dataType: row.data_type,
        enumValues: row.enum_values
          ? typeof row.enum_values === 'string'
            ? (JSON.parse(row.enum_values) as string[])
            : row.enum_values
          : null,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get feature definition for ${featureKey}: ${(error as Error).message}`,
        error,
      );
      return null;
    }
  }

  /**
   * Validate a value against the feature's declared data type
   * Returns error message if invalid, null if valid
   */
  private validateFeatureValue(
    value: unknown,
    feature: FeatureDefinition,
  ): string | null {
    switch (feature.dataType) {
      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Feature '${feature.key}' expects a boolean value, got ${typeof value}`;
        }
        break;

      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return `Feature '${feature.key}' expects a number value, got ${typeof value}`;
        }
        break;

      case 'string':
        if (typeof value !== 'string') {
          return `Feature '${feature.key}' expects a string value, got ${typeof value}`;
        }
        break;

      case 'enum':
        if (typeof value !== 'string') {
          return `Feature '${feature.key}' expects an enum string value, got ${typeof value}`;
        }
        if (feature.enumValues && !feature.enumValues.includes(value)) {
          return `Feature '${feature.key}' expects one of [${feature.enumValues.join(', ')}], got '${value}'`;
        }
        break;

      default: {
        // Handle unexpected data types from DB (defensive coding)
        const unknownType = feature.dataType as string;
        this.logger.warn(
          `Unknown data type '${unknownType}' for feature ${feature.key}`,
        );
      }
    }

    return null;
  }
}
