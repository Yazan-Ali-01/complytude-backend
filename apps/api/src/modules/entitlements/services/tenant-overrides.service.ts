import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import { I18nKeys } from '../../../common/constants/i18n-keys';
import {
  TenantOverride,
  UpdateTenantOverrideRow,
} from '../../../common/types/entitlement.types';
import { DatabaseService } from '../../../database/database.service';
import { TenantOverridesRepository } from '../../../repositories/entitlements/tenant-overrides.repository';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { ServiceCallOptions } from '../../tenants/tenant.service';
import {
  ApplyOverrideDto,
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
    private readonly i18n: I18nService,
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
      { tenantId, isTenantAdmin: context.canManageSettings ?? false },
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
    // Validate exactly one value field
    this.validateValueFields(dto);

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
        this.i18n.t(I18nKeys.OVERRIDE_FEATURE_NOT_FOUND, {
          args: { featureKey: dto.featureKey },
        }),
      );
    }

    // Create override
    const override = await this.tenantOverridesRepository.create(
      {
        tenant_id: tenantId,
        feature_id: feature.id,
        value_bool: dto.valueBool,
        value_int: dto.valueInt,
        value_text: dto.valueText,
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
    // Validate at most one value field
    this.validateValueFieldsForUpdate(dto);

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
    const updates: UpdateTenantOverrideRow = {};
    if (
      dto.valueBool !== undefined ||
      dto.valueInt !== undefined ||
      dto.valueText !== undefined
    ) {
      updates.value_bool = dto.valueBool ?? null;
      updates.value_int = dto.valueInt ?? null;
      updates.value_text = dto.valueText ?? null;
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
      throw new NotFoundException(this.i18n.t(I18nKeys.OVERRIDE_NOT_FOUND));
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
    console.log('===================================================');
    console.log('options', options);
    console.log('===================================================');
    const { context } = options;
    console.log('===================================================');
    console.log('context', context.mode);
    console.log('===================================================');
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

  /**
   * Validate exactly one value field is set (for create)
   */
  private validateValueFields(dto: ApplyOverrideDto): void {
    const fieldsSet = [
      dto.valueBool !== undefined,
      dto.valueInt !== undefined,
      dto.valueText !== undefined,
    ].filter(Boolean).length;

    if (fieldsSet !== 1) {
      throw new BadRequestException(
        this.i18n.t(I18nKeys.OVERRIDE_INVALID_VALUE),
      );
    }
  }

  /**
   * Validate at most one value field is set (for update)
   */
  private validateValueFieldsForUpdate(dto: UpdateOverrideDto): void {
    const fieldsSet = [
      dto.valueBool !== undefined,
      dto.valueInt !== undefined,
      dto.valueText !== undefined,
    ].filter(Boolean).length;

    if (fieldsSet > 1) {
      throw new BadRequestException(
        this.i18n.t(I18nKeys.OVERRIDE_INVALID_VALUE),
      );
    }
  }
}
