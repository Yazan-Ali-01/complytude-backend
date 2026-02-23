import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { MessageResponseDto } from '../../../common/dto';
import {
  CreateTenantAddonRow,
  TenantAddon,
  UpdateTenantAddonRow,
} from '../../../common/types/entitlement.types';
import { DatabaseService } from '../../../database/database.service';
import { TenantAddonsRepository } from '../../../repositories/entitlements/tenant-addons.repository';
import { TenantContext } from '../../tenants/tenant.service';
import { EntitlementSnapshotService } from './entitlement-snapshot.service';

/**
 * Tenant Add-ons Service
 *
 * Manages tenant add-on subscriptions. All mutations invalidate entitlement
 * snapshots to ensure cached entitlements reflect add-on changes immediately.
 *
 * Per PHASE-7-8-TEST-ANALYSIS.md: When add-ons are added/removed, snapshots
 * must be invalidated. This service ensures that invariant.
 */
@Injectable()
export class TenantAddonsService {
  private readonly logger = new Logger(TenantAddonsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantAddonsRepository: TenantAddonsRepository,
    private readonly entitlementSnapshotService: EntitlementSnapshotService,
  ) {}

  /**
   * Add an add-on to a tenant
   *
   * Invalidates entitlement snapshot so next resolution uses fresh add-on data.
   *
   * @param data - Add-on creation data
   * @param options - Query options
   * @returns Created tenant add-on
   */
  async addAddon(
    data: CreateTenantAddonRow,
    context?: TenantContext,
  ): Promise<TenantAddon> {
    if (context?.mode !== 'platform') {
      throw new ForbiddenException('Only platform admins can manage add-ons');
    }
    const execute = async (client: PoolClient) => {
      const addon = await this.tenantAddonsRepository.create(
        {
          ...data,
          status: data.status ?? 'active',
          starts_at: data.starts_at ?? new Date(),
        },
        { client },
      );

      await this.entitlementSnapshotService.invalidate(
        data.tenant_id,
        'addon_added',
        { client },
      );

      this.logger.log(
        `Add-on added: tenant=${data.tenant_id}, addon=${data.addon_id}`,
      );
      return addon;
    };

    return this.databaseService.transactionWithPlatformAdminContext(execute);
  }

  /**
   * Update a tenant add-on (quantity, status, expires_at)
   *
   * Invalidates entitlement snapshot after update.
   *
   * @param tenantId - Tenant ID
   * @param tenantAddonId - Tenant add-on ID to update
   * @param updates - Fields to update
   * @param options - Query options
   * @returns Updated tenant add-on
   */
  async updateAddon(
    tenantId: string,
    tenantAddonId: string,
    updates: UpdateTenantAddonRow,
    context?: TenantContext,
  ): Promise<TenantAddon> {
    if (context?.mode !== 'platform') {
      throw new ForbiddenException('Only platform admins can update add-ons');
    }
    const execute = async (client: PoolClient) => {
      const addon = await this.tenantAddonsRepository.update(
        tenantAddonId,
        updates,
        { client },
      );

      await this.entitlementSnapshotService.invalidate(
        tenantId,
        'addon_updated',
        { client },
      );

      this.logger.log(
        `Add-on updated: tenant=${tenantId}, addon=${tenantAddonId}`,
      );
      return addon;
    };

    return await this.databaseService.transactionWithPlatformAdminContext(
      execute,
    );
  }

  /**
   * Remove (deactivate) an add-on for a tenant
   *
   * Sets status to 'cancelled' and invalidates entitlement snapshot.
   *
   * @param tenantId - Tenant ID
   * @param tenantAddonId - Tenant add-on ID to remove
   * @param options - Query options
   * @returns Updated tenant add-on
   */
  async removeAddon(
    tenantId: string,
    tenantAddonId: string,
    context?: TenantContext,
  ): Promise<MessageResponseDto> {
    if (context?.mode !== 'platform') {
      throw new ForbiddenException('Only platform admins can remove add-ons');
    }
    const execute = async (client: PoolClient) => {
      const addon = await this.tenantAddonsRepository.update(
        tenantAddonId,
        { status: 'cancelled' },
        { client },
      );

      await this.entitlementSnapshotService.invalidate(
        tenantId,
        'addon_removed',
        { client },
      );

      return addon;
    };

    if (context?.mode === 'platform') {
      await this.databaseService.transactionWithPlatformAdminContext(execute);
      return new MessageResponseDto('Add-on removed successfully');
    }
    return new InternalServerErrorException('Failed to remove add-on');
  }
}
