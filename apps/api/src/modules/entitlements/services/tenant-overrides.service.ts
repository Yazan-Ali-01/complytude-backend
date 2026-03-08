import { DatabaseService } from '@lib/database';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { I18n, I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import { CommonI18n } from '../../../common/constants';
import { getFeatureStorageType } from '../../../common/constants/plan-entitlements.constant';
import {
  TenantOverride,
  UpdateTenantOverrideRow,
} from '../../../common/types/entitlement.types';
import { TenantOverridesRepository } from '../../../repositories/entitlements/tenant-overrides.repository';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { ServiceCallOptions } from '../../tenants/tenant.service';
import { EntitlementsI18n } from '../constants/i18n.constants';
import {
  ApplyOverrideDto,
  OverrideValueValidationDto,
  UpdateOverrideDto,
} from '../dto/tenant-override.dto';
import { EntitlementSnapshotService } from './entitlement-snapshot.service';

/**
 * Tenant Overrides Service
 */
@Injectable()
export class TenantOverridesService {
  private readonly logger = new Logger(TenantOverridesService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantOverridesRepository: TenantOverridesRepository,
    private readonly featuresRepository: FeaturesRepository,
    private readonly entitlementSnapshotService: EntitlementSnapshotService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  /**
   * List active overrides for a tenant
   */
  async listOverrides(
    tenantId: string,
    options: ServiceCallOptions,
  ): Promise<TenantOverride[]> {
    if ('client' in options) {
      return this.tenantOverridesRepository.findActiveByTenant(tenantId, {
        client: options.client,
      });
    }

    const { context } = options;
    if (context.mode === 'platform') {
      return this.databaseService.transactionWithPlatformAdminContext(
        (client) =>
          this.tenantOverridesRepository.findActiveByTenant(tenantId, {
            client,
          }),
      );
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId, isTenantAdmin: true },
      (client) =>
        this.tenantOverridesRepository.findActiveByTenant(tenantId, { client }),
    );
  }

  /**
   * Apply an override for a tenant
   * Single transaction: validate → create → invalidate snapshot
   */
  async applyOverride(
    tenantId: string,
    dto: ApplyOverrideDto,
    appliedBy: string,
    options: ServiceCallOptions,
  ): Promise<TenantOverride> {
    if ('client' in options) {
      return this.executeApplyOverride(
        tenantId,
        dto,
        appliedBy,
        options.client,
      );
    }

    const { context } = options;
    if (context.mode === 'platform') {
      return this.databaseService.transactionWithPlatformAdminContext(
        (client) => this.executeApplyOverride(tenantId, dto, appliedBy, client),
      );
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId, isTenantAdmin: true },
      (client) => this.executeApplyOverride(tenantId, dto, appliedBy, client),
    );
  }

  private async executeApplyOverride(
    tenantId: string,
    dto: ApplyOverrideDto,
    appliedBy: string,
    client: PoolClient,
  ): Promise<TenantOverride> {
    // Validate feature exists
    const feature = await this.featuresRepository.findByKey(dto.featureKey, {
      client,
    });
    if (!feature) {
      throw new NotFoundException(
        this.i18n.t(EntitlementsI18n.errors.OVERRIDE_FEATURE_NOT_FOUND, {
          args: { featureKey: dto.featureKey },
        }),
      );
    }

    // Map the single `value` to the correct DB column based on the feature's storage type
    const storageType = getFeatureStorageType(dto.featureKey);
    const valueColumns = {
      value_bool: storageType === 'bool' ? (dto.value as boolean) : undefined,
      value_int: storageType === 'int' ? (dto.value as number) : undefined,
      value_text: storageType === 'text' ? (dto.value as string) : undefined,
    };

    // Create override
    const override = await this.tenantOverridesRepository.create(
      {
        tenant_id: tenantId,
        feature_id: feature.id,
        ...valueColumns,
        reason: dto.reason,
        applied_by: appliedBy,
        starts_at: new Date(),
        expires_at: dto.expiresAt,
        is_active: true,
      },
      { client },
    );

    await this.entitlementSnapshotService.invalidate(
      tenantId,
      'override_applied',
      { client },
    );

    // Fetch with feature details
    const enriched = await this.tenantOverridesRepository.findActiveByTenant(
      tenantId,
      { client },
    );
    const created = enriched.find((o) => o.id === override.id);

    this.logger.log(
      `Override applied: tenant=${tenantId}, feature=${feature.id}`,
    );
    return created || override;
  }

  /**
   * Update a tenant override
   */
  async updateOverride(
    tenantId: string,
    overrideId: string,
    dto: UpdateOverrideDto,
    options: ServiceCallOptions,
  ): Promise<TenantOverride> {
    if ('client' in options) {
      return this.executeUpdateOverride(
        tenantId,
        overrideId,
        dto,
        options.client,
      );
    }

    const { context } = options;
    if (context.mode === 'platform') {
      return this.databaseService.transactionWithPlatformAdminContext(
        (client) =>
          this.executeUpdateOverride(tenantId, overrideId, dto, client),
      );
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId, isTenantAdmin: true },
      (client) => this.executeUpdateOverride(tenantId, overrideId, dto, client),
    );
  }

  private async executeUpdateOverride(
    tenantId: string,
    overrideId: string,
    dto: UpdateOverrideDto,
    client: PoolClient,
  ): Promise<TenantOverride> {
    // Look up the existing override first to get its feature_key (needed for value mapping)
    const existing = await this.tenantOverridesRepository
      .findActiveByTenant(tenantId, { client })
      .then((overrides) => overrides.find((o) => o.id === overrideId));

    if (!existing) {
      throw new NotFoundException(
        this.i18n.t(EntitlementsI18n.errors.OVERRIDE_NOT_FOUND),
      );
    }

    if (dto.value !== undefined) {
      const probe = plainToInstance(OverrideValueValidationDto, {
        featureKey: existing.feature_key,
        value: dto.value,
      });
      const errors = await validate(probe);
      if (errors.length) {
        throw new BadRequestException(
          this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
            'Exactly one of valueBool, valueInt, or valueText must be provided',
          errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; '),
        );
      }
    }

    const updates: UpdateTenantOverrideRow = {};

    if (dto.value !== undefined) {
      const storageType = getFeatureStorageType(existing.feature_key);
      updates.value_bool =
        storageType === 'bool' ? (dto.value as boolean) : null;
      updates.value_int = storageType === 'int' ? (dto.value as number) : null;
      updates.value_text =
        storageType === 'text' ? (dto.value as string) : null;
    }

    if (dto.reason !== undefined) {
      updates.reason = dto.reason;
    }

    if (dto.expiresAt !== undefined) {
      updates.expires_at = dto.expiresAt;
    }

    await this.tenantOverridesRepository.update(overrideId, updates, {
      client,
    });

    await this.entitlementSnapshotService.invalidate(
      tenantId,
      'override_updated',
      { client },
    );

    const enriched = await this.tenantOverridesRepository.findActiveByTenant(
      tenantId,
      { client },
    );
    const updated = enriched.find((o) => o.id === overrideId);

    if (!updated) {
      throw new NotFoundException(
        this.i18n.t(EntitlementsI18n.errors.OVERRIDE_NOT_FOUND),
      );
    }

    this.logger.log(
      `Override updated: tenant=${tenantId}, override=${overrideId}`,
    );
    return updated;
  }

  /**
   * Revoke (deactivate) an override
   */
  async revokeOverride(
    tenantId: string,
    overrideId: string,
    options: ServiceCallOptions,
  ): Promise<void> {
    if ('client' in options) {
      await this.executeRevokeOverride(tenantId, overrideId, options.client);
      return;
    }
    const { context } = options;
    if (context.mode === 'platform') {
      return this.databaseService.transactionWithPlatformAdminContext(
        (client) => this.executeRevokeOverride(tenantId, overrideId, client),
      );
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId, isTenantAdmin: true },
      (client) => this.executeRevokeOverride(tenantId, overrideId, client),
    );
  }

  private async executeRevokeOverride(
    tenantId: string,
    overrideId: string,
    client: PoolClient,
  ): Promise<void> {
    const overrides = await this.tenantOverridesRepository.findActiveByTenant(
      tenantId,
      { client },
    );
    if (!overrides.some((o) => o.id === overrideId)) {
      throw new NotFoundException(
        this.i18n.t(EntitlementsI18n.errors.OVERRIDE_NOT_FOUND),
      );
    }

    await this.tenantOverridesRepository.update(
      overrideId,
      { is_active: false },
      { client },
    );

    await this.entitlementSnapshotService.invalidate(
      tenantId,
      'override_revoked',
      { client },
    );

    this.logger.log(
      `Override revoked: tenant=${tenantId}, override=${overrideId}`,
    );
  }
}
