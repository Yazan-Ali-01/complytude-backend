import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import Stripe from 'stripe';
import {
  Addon,
  TenantAddon as _TenantAddon,
} from 'src/common/types/entitlement.types';
import { AddonsRepository } from 'src/repositories/entitlements/addons.repository';
import { TenantAddonsRepository } from 'src/repositories/entitlements/tenant-addons.repository';

/**
 * Mutation types for addon synchronization operations.
 */
export type AddonSyncMutationType =
  | 'create'
  | 'reactivate'
  | 'update_quantity'
  | 'cancel';

/**
 * Represents a single addon synchronization operation.
 */
export interface AddonSyncMutation {
  type: AddonSyncMutationType;
  stripeItemId: string;
  addonKey?: string;
  dbAddonId?: string;
  quantity?: number;
  previousQuantity?: number; // For update_quantity operations
}

/**
 * Result of addon synchronization analysis.
 */
export interface AddonSyncResult {
  mutations: AddonSyncMutation[];
  addonCatalog: Map<string, Addon>;
  stripeItemMap: Map<string, Stripe.SubscriptionItem>;
}

/**
 * Options for addon synchronization execution.
 */
export interface AddonSyncExecutionOptions {
  tenantId: string;
  client: PoolClient;
  context: string; // For logging: 'webhook' | 'reconciliation'
  eventId?: string; // For webhook context
}

/**
 * Shared engine for synchronizing addon state between Stripe and database.
 *
 * This service extracts the common logic used by both:
 * - Webhook handlers (immediate execution)
 * - Reconciliation service (batch analysis + execution)
 *
 * The engine provides two main operations:
 * 1. `analyzeSync()` - Compare Stripe vs DB state and return required mutations
 * 2. `executeMutations()` - Apply mutations to the database
 *
 * This eliminates code duplication while allowing different execution patterns.
 */
@Injectable()
export class AddonSyncEngine {
  private readonly logger = new Logger(AddonSyncEngine.name);

  constructor(
    private readonly addonsRepository: AddonsRepository,
    private readonly tenantAddonsRepository: TenantAddonsRepository,
  ) {}

  /**
   * Analyze Stripe subscription vs database state and return required mutations.
   *
   * This method is pure analysis - it doesn't modify any state. Callers can:
   * - Execute mutations immediately (webhook pattern)
   * - Collect mutations for batch processing (reconciliation pattern)
   * - Log/report mutations without executing them
   */
  async analyzeSync(
    tenantId: string,
    stripeSubscription: Stripe.Subscription,
    options?: { client?: PoolClient },
  ): Promise<AddonSyncResult> {
    // Build addon catalog: price_id → addon mapping
    const allAddons = await this.addonsRepository.findAllActive(options);
    const addonCatalog = new Map(
      allAddons
        .filter((addon) => addon.stripe_price_id != null)
        .map((addon) => [addon.stripe_price_id!, addon]),
    );

    // Filter Stripe items to addon-related ones only
    const addonStripeItems = stripeSubscription.items.data.filter((item) => {
      const priceId =
        typeof item.price === 'string' ? item.price : item.price.id;
      return addonCatalog.has(priceId);
    });

    // Build Stripe item map for quick lookup
    const stripeItemMap = new Map(
      stripeSubscription.items.data.map((item) => [item.id, item]),
    );

    const stripeItemIds = new Set(addonStripeItems.map((item) => item.id));

    // Get current active addons from database
    const activeDbAddons = await this.tenantAddonsRepository.findActiveByTenant(
      tenantId,
      options,
    );
    const activeDbByItemId = new Map(
      activeDbAddons
        .filter((addon) => addon.stripe_subscription_item_id != null)
        .map((addon) => [addon.stripe_subscription_item_id!, addon]),
    );

    const mutations: AddonSyncMutation[] = [];

    // Analyze Stripe items: create, reactivate, or update quantity
    for (const stripeItem of addonStripeItems) {
      const priceId =
        typeof stripeItem.price === 'string'
          ? stripeItem.price
          : stripeItem.price.id;
      const addon = addonCatalog.get(priceId)!;
      const quantity = stripeItem.quantity ?? 1;

      if (activeDbByItemId.has(stripeItem.id)) {
        // Item exists and is active - check if quantity changed
        const existing = activeDbByItemId.get(stripeItem.id)!;
        if (existing.quantity !== quantity) {
          mutations.push({
            type: 'update_quantity',
            stripeItemId: stripeItem.id,
            addonKey: addon.key,
            dbAddonId: existing.id,
            quantity,
            previousQuantity: existing.quantity,
          });
        }
        continue;
      }

      // Check if a cancelled record exists for this item
      const existingAny =
        await this.tenantAddonsRepository.findByStripeSubscriptionItemId(
          stripeItem.id,
          options,
        );

      if (existingAny) {
        mutations.push({
          type: 'reactivate',
          stripeItemId: stripeItem.id,
          addonKey: addon.key,
          dbAddonId: existingAny.id,
          quantity,
        });
      } else {
        mutations.push({
          type: 'create',
          stripeItemId: stripeItem.id,
          addonKey: addon.key,
          quantity,
        });
      }
    }

    // Analyze DB addons: cancel items that no longer exist in Stripe
    for (const [itemId, dbAddon] of activeDbByItemId) {
      if (!stripeItemIds.has(itemId)) {
        mutations.push({
          type: 'cancel',
          stripeItemId: itemId,
          dbAddonId: dbAddon.id,
        });
      }
    }

    return {
      mutations,
      addonCatalog,
      stripeItemMap,
    };
  }

  /**
   * Execute addon synchronization mutations against the database.
   *
   * This method applies the mutations returned by `analyzeSync()`.
   * It handles all mutation types and provides detailed logging.
   */
  async executeMutations(
    mutations: AddonSyncMutation[],
    addonCatalog: Map<string, Addon>,
    stripeItemMap: Map<string, Stripe.SubscriptionItem>,
    options: AddonSyncExecutionOptions,
  ): Promise<void> {
    const { tenantId, client, context, eventId } = options;

    for (const mutation of mutations) {
      await this.executeSingleMutation(mutation, addonCatalog, stripeItemMap, {
        tenantId,
        client,
        context,
        eventId,
      });
    }
  }

  /**
   * Execute a single addon synchronization mutation.
   */
  private async executeSingleMutation(
    mutation: AddonSyncMutation,
    addonCatalog: Map<string, Addon>,
    stripeItemMap: Map<string, Stripe.SubscriptionItem>,
    options: AddonSyncExecutionOptions,
  ): Promise<void> {
    const { tenantId, client, context, eventId } = options;
    const logContext = eventId ? `${context} event=${eventId}` : context;

    switch (mutation.type) {
      case 'update_quantity':
        await this.tenantAddonsRepository.update(
          mutation.dbAddonId!,
          { quantity: mutation.quantity! },
          { client },
        );
        this.logger.log(
          `${context} addon sync: updated quantity addon=${mutation.addonKey} ` +
            `item=${mutation.stripeItemId} ${mutation.previousQuantity}→${mutation.quantity} ` +
            `tenant=${tenantId} ${logContext}`,
        );
        break;

      case 'reactivate':
        await this.tenantAddonsRepository.update(
          mutation.dbAddonId!,
          { status: 'active', quantity: mutation.quantity! },
          { client },
        );
        this.logger.log(
          `${context} addon sync: reactivated addon=${mutation.addonKey} ` +
            `item=${mutation.stripeItemId} tenant=${tenantId} ${logContext}`,
        );
        break;

      case 'create': {
        const stripeItem = stripeItemMap.get(mutation.stripeItemId);
        if (!stripeItem) {
          this.logger.warn(
            `${context} addon sync: Stripe item not found for create mutation: ${mutation.stripeItemId}`,
          );
          break;
        }

        const priceId =
          typeof stripeItem.price === 'string'
            ? stripeItem.price
            : stripeItem.price.id;
        const addon = addonCatalog.get(priceId);
        if (!addon) {
          this.logger.warn(
            `${context} addon sync: Addon not found for price ${priceId} in create mutation`,
          );
          break;
        }

        await this.tenantAddonsRepository.create(
          {
            tenant_id: tenantId,
            addon_id: addon.id,
            quantity: mutation.quantity!,
            status: 'active',
            starts_at: new Date(),
            stripe_subscription_item_id: mutation.stripeItemId,
          },
          { client },
        );
        this.logger.log(
          `${context} addon sync: created addon=${addon.key} ` +
            `item=${mutation.stripeItemId} tenant=${tenantId} ${logContext}`,
        );
        break;
      }

      case 'cancel':
        await this.tenantAddonsRepository.update(
          mutation.dbAddonId!,
          { status: 'cancelled' },
          { client },
        );
        this.logger.log(
          `${context} addon sync: cancelled item=${mutation.stripeItemId} ` +
            `tenant=${tenantId} ${logContext}`,
        );
        break;

      default:
        this.logger.error(
          `${context} addon sync: Unknown mutation type: ${(mutation as any).type}`,
        );
        break;
    }
  }

  /**
   * Convenience method that combines analysis and execution.
   *
   * Useful for simple cases where you want to sync immediately.
   * Returns whether any changes were made.
   */
  async syncAddons(
    tenantId: string,
    stripeSubscription: Stripe.Subscription,
    options: AddonSyncExecutionOptions,
  ): Promise<boolean> {
    const { mutations, addonCatalog, stripeItemMap } = await this.analyzeSync(
      tenantId,
      stripeSubscription,
      { client: options.client },
    );

    if (mutations.length === 0) {
      return false;
    }

    await this.executeMutations(
      mutations,
      addonCatalog,
      stripeItemMap,
      options,
    );
    return true;
  }
}
