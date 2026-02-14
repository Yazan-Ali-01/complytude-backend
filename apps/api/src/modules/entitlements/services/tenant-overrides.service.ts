import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  CreateTenantOverrideRow,
  TenantOverride,
  UpdateTenantOverrideRow,
} from '../../../common/types/entitlement.types';
import { DatabaseService } from '../../../database/database.service';
import { QueryOptions } from '../../../repositories/base/repository.interface';
import { TenantOverridesRepository } from '../../../repositories/entitlements/tenant-overrides.repository';
import { EntitlementSnapshotService } from './entitlement-snapshot.service';

/**
 * Tenant Overrides Service
 *
 * Manages admin-applied entitlement overrides. All mutations invalidate
 * entitlement snapshots to ensure cached entitlements reflect override
 * changes immediately.
 *
 * Per PHASE-7-8-TEST-ANALYSIS.md: When overrides are applied/expired,
 * snapshots must be invalidated. This service ensures that invariant.
 */
@Injectable()
export class TenantOverridesService {
  private readonly logger = new Logger(TenantOverridesService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantOverridesRepository: TenantOverridesRepository,
    private readonly entitlementSnapshotService: EntitlementSnapshotService,
  ) {}

  /**
   * Apply an override for a tenant
   *
   * Invalidates entitlement snapshot so next resolution uses fresh override data.
   *
   * @param data - Override creation data
   * @param options - Query options
   * @returns Created tenant override
   */
  async applyOverride(
    data: CreateTenantOverrideRow,
    options?: QueryOptions,
  ): Promise<TenantOverride> {
    const execute = async (client: PoolClient) => {
      const override = await this.tenantOverridesRepository.create(
        {
          ...data,
          starts_at: data.starts_at ?? new Date(),
          is_active: data.is_active ?? true,
        },
        { client },
      );

      await this.entitlementSnapshotService.invalidate(
        data.tenant_id,
        'override_applied',
        { client },
      );

      this.logger.log(
        `Override applied: tenant=${data.tenant_id}, feature=${data.feature_id}`,
      );
      return override;
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      data.tenant_id,
      execute,
    );
  }

  /**
   * Update a tenant override
   *
   * Invalidates entitlement snapshot after update.
   *
   * @param tenantId - Tenant ID
   * @param overrideId - Override ID to update
   * @param updates - Fields to update
   * @param options - Query options
   * @returns Updated tenant override
   */
  async updateOverride(
    tenantId: string,
    overrideId: string,
    updates: UpdateTenantOverrideRow,
    options?: QueryOptions,
  ): Promise<TenantOverride> {
    const execute = async (client: PoolClient) => {
      const override = await this.tenantOverridesRepository.update(
        overrideId,
        updates,
        { client },
      );

      await this.entitlementSnapshotService.invalidate(
        tenantId,
        'override_updated',
        { client },
      );

      this.logger.log(
        `Override updated: tenant=${tenantId}, override=${overrideId}`,
      );
      return override;
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(tenantId, execute);
  }

  /**
   * Revoke (deactivate) an override for a tenant
   *
   * Sets is_active to false and invalidates entitlement snapshot.
   *
   * @param tenantId - Tenant ID
   * @param overrideId - Override ID to revoke
   * @param options - Query options
   * @returns Updated tenant override
   */
  async revokeOverride(
    tenantId: string,
    overrideId: string,
    options?: QueryOptions,
  ): Promise<TenantOverride> {
    return this.updateOverride(
      tenantId,
      overrideId,
      { is_active: false },
      options,
    );
  }
}
