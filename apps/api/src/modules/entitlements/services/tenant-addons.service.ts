import { DatabaseService } from '@lib/database';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import {
  Addon,
  TenantAddonWithEntitlements,
  UpdateTenantAddonRow,
} from '../../../common/types/entitlement.types';
import {
  AddonWithEntitlements,
  AddonsRepository,
} from '../../../repositories/entitlements/addons.repository';
import { TenantAddonsRepository } from '../../../repositories/entitlements/tenant-addons.repository';
import { ServiceCallOptions } from '../../tenants/tenant.service';
import { EntitlementsI18n } from '../constants/i18n.constants';
import { EntitlementSnapshotService } from './entitlement-snapshot.service';

// TODO: TenantContext will evolve to support:
// - mode: 'platform' — platform admin operations (bypass RLS)
// - mode: 'purchase' — tenant self-service purchases (new RLS context)
// - mode: 'tenant' — standard tenant operations (current tenant RLS)
// For now, addons use tenant admin context; overrides use platform context.

/**
 * Tenant Add-ons Service
 */
@Injectable()
export class TenantAddonsService {
  private readonly logger = new Logger(TenantAddonsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantAddonsRepository: TenantAddonsRepository,
    private readonly addonsRepository: AddonsRepository,
    private readonly entitlementSnapshotService: EntitlementSnapshotService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * List active addons for a tenant
   */
  async listAddons(
    tenantId: string,
    options: ServiceCallOptions,
  ): Promise<TenantAddonWithEntitlements[]> {
    if ('client' in options) {
      return this.tenantAddonsRepository.findActiveByTenantWithEntitlements(
        tenantId,
        { client: options.client },
      );
    }

    const { context } = options;
    if (context.mode === 'platform') {
      return this.databaseService.transactionWithPlatformAdminContext(
        (client) =>
          this.tenantAddonsRepository.findActiveByTenantWithEntitlements(
            tenantId,
            {
              client,
            },
          ),
      );
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      (client) =>
        this.tenantAddonsRepository.findActiveByTenantWithEntitlements(
          tenantId,
          {
            client,
          },
        ),
    );
  }

  /**
   * Add an add-on to a tenant
   * Single transaction: validate → create → fetch enriched → invalidate snapshot
   */
  async addAddon(
    tenantId: string,
    addonKey: string,
    quantity: number,
    options: ServiceCallOptions,
  ): Promise<TenantAddonWithEntitlements> {
    if ('client' in options) {
      return this.executeAddAddon(tenantId, addonKey, quantity, options.client);
    }

    const { context } = options;
    if (context.mode === 'platform') {
      return this.databaseService.transactionWithPlatformAdminContext(
        (client) => this.executeAddAddon(tenantId, addonKey, quantity, client),
      );
    }

    // TODO: Replace with transactionWithPurchaseContext when purchase RLS is implemented
    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      (client) => this.executeAddAddon(tenantId, addonKey, quantity, client),
    );
  }

  private async executeAddAddon(
    tenantId: string,
    addonKey: string,
    quantity: number,
    client: PoolClient,
  ): Promise<TenantAddonWithEntitlements> {
    // Validate addon exists in catalog
    const addon = await this.addonsRepository.findByKey(addonKey, { client });
    if (!addon) {
      throw new NotFoundException(
        this.i18n.t(EntitlementsI18n.errors.ADDON_NOT_FOUND),
      );
    }

    // Check for duplicate
    const existing = await this.tenantAddonsRepository.findActiveByTenant(
      tenantId,
      { client },
    );
    if (existing.some((a) => a.addon_id === addon.id)) {
      throw new ConflictException(
        this.i18n.t(EntitlementsI18n.errors.ADDON_ALREADY_ACTIVE),
      );
    }

    // Create addon
    await this.tenantAddonsRepository.create(
      {
        tenant_id: tenantId,
        addon_id: addon.id,
        quantity,
        status: 'active',
        starts_at: new Date(),
      },
      { client },
    );

    // Invalidate snapshot
    await this.entitlementSnapshotService.invalidate(tenantId, 'addon_added', {
      client,
    });

    // Fetch enriched result
    const addons =
      await this.tenantAddonsRepository.findActiveByTenantWithEntitlements(
        tenantId,
        { client },
      );
    const created = addons.find((a) => a.addon_id === addon.id);

    if (!created) {
      throw new Error('Failed to retrieve created addon');
    }

    this.logger.log(`Add-on added: tenant=${tenantId}, addon=${addon.id}`);
    return created;
  }

  /**
   * Update a tenant add-on
   * Single transaction: update → fetch enriched → invalidate snapshot
   */
  async updateAddon(
    tenantId: string,
    tenantAddonId: string,
    updates: UpdateTenantAddonRow,
    options: ServiceCallOptions,
  ): Promise<TenantAddonWithEntitlements> {
    if ('client' in options) {
      return this.executeUpdateAddon(
        tenantId,
        tenantAddonId,
        updates,
        options.client,
      );
    }

    const { context } = options;
    if (context.mode === 'platform') {
      return this.databaseService.transactionWithPlatformAdminContext(
        (client) =>
          this.executeUpdateAddon(tenantId, tenantAddonId, updates, client),
      );
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      (client) =>
        this.executeUpdateAddon(tenantId, tenantAddonId, updates, client),
    );
  }

  private async executeUpdateAddon(
    tenantId: string,
    tenantAddonId: string,
    updates: UpdateTenantAddonRow,
    client: PoolClient,
  ): Promise<TenantAddonWithEntitlements> {
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates ?? {}).filter(([_, value]) => value !== undefined),
    );

    if (!filteredUpdates || Object.keys(filteredUpdates).length === 0) {
      return this.tenantAddonsRepository
        .findByTenantIdWithEntitlements(tenantId, { client })
        .then((addons) => {
          const addon = addons.find((a) => a.id === tenantAddonId);
          if (!addon) {
            throw new NotFoundException(
              this.i18n.t(EntitlementsI18n.errors.ADDON_NOT_FOUND),
            );
          }
          return addon;
        });
    }

    await this.tenantAddonsRepository.update(tenantAddonId, filteredUpdates, {
      client,
    });

    await this.entitlementSnapshotService.invalidate(
      tenantId,
      'addon_updated',
      { client },
    );

    const addons =
      await this.tenantAddonsRepository.findByTenantIdWithEntitlements(
        tenantId,
        { client },
      );
    const updated = addons.find((a) => a.id === tenantAddonId);

    if (!updated) {
      throw new NotFoundException(
        this.i18n.t(EntitlementsI18n.errors.ADDON_NOT_FOUND),
      );
    }

    this.logger.log(
      `Add-on updated: tenant=${tenantId}, addon=${tenantAddonId}`,
    );
    return updated;
  }

  /**
   * Remove (cancel) an add-on
   */
  async removeAddon(
    tenantId: string,
    tenantAddonId: string,
    options: ServiceCallOptions,
  ): Promise<void> {
    if ('client' in options) {
      return this.executeRemoveAddon(tenantId, tenantAddonId, options.client);
    }

    const { context } = options;
    if (context.mode === 'platform') {
      return this.databaseService.transactionWithPlatformAdminContext(
        (client) => this.executeRemoveAddon(tenantId, tenantAddonId, client),
      );
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      (client) => this.executeRemoveAddon(tenantId, tenantAddonId, client),
    );
  }

  private async executeRemoveAddon(
    tenantId: string,
    tenantAddonId: string,
    client: PoolClient,
  ): Promise<void> {
    const existing = await this.tenantAddonsRepository.findActiveByTenant(
      tenantId,
      { client },
    );
    if (!existing.some((a) => a.id === tenantAddonId)) {
      throw new NotFoundException(
        this.i18n.t(EntitlementsI18n.errors.ADDON_NOT_FOUND),
      );
    }

    await this.tenantAddonsRepository.update(
      tenantAddonId,
      { status: 'cancelled' },
      { client },
    );

    await this.entitlementSnapshotService.invalidate(
      tenantId,
      'addon_removed',
      { client },
    );

    this.logger.log(
      `Add-on removed: tenant=${tenantId}, addon=${tenantAddonId}`,
    );
  }

  /**
   * List all active add-ons from the global catalog (public, no tenant context)
   */
  async listCatalog(): Promise<Addon[]> {
    return this.addonsRepository.findAllActive();
  }

  /**
   * Get a single add-on from the catalog with its entitlements (public, no tenant context)
   */
  async getCatalogByKey(key: string): Promise<AddonWithEntitlements | null> {
    return this.addonsRepository.findByKeyWithEntitlements(key);
  }
}
