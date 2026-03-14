import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantAddonWithEntitlements } from 'src/common/types/entitlement.types';
import { AddonsRepository } from 'src/repositories/entitlements/addons.repository';
import { TenantAddonsRepository } from 'src/repositories/entitlements/tenant-addons.repository';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import { EntitlementSnapshotService } from '../../entitlements/services/entitlement-snapshot.service';
import { StripeService } from '../stripe.service';
import { DatabaseService } from '@lib/database';

/**
 * Manages add-on lifecycle through Stripe subscription items.
 *
 * Each add-on maps to a Stripe subscription item (si_xxx) on the tenant's
 * existing subscription. Mutations are reflected in both Stripe and our DB,
 * with proration applied immediately (not at period end).
 */
@Injectable()
export class StripeAddonService {
  private readonly logger = new Logger(StripeAddonService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly databaseService: DatabaseService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly addonsRepository: AddonsRepository,
    private readonly tenantAddonsRepository: TenantAddonsRepository,
    private readonly entitlementSnapshotService: EntitlementSnapshotService,
  ) {}

  /**
   * Add an add-on to a tenant's Stripe subscription.
   * Creates a subscription item in Stripe, then records it in our DB.
   */
  async addAddon(
    tenantId: string,
    addonKey: string,
    quantity: number = 1,
  ): Promise<TenantAddonWithEntitlements> {
    // Validate: active Stripe subscription required
    const subscription =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.subscriptionsRepository.findActiveByTenant(tenantId, { client }),
      );

    if (!subscription?.stripe_subscription_id) {
      throw new BadRequestException(
        'No active Stripe subscription. Subscribe to a paid plan first.',
      );
    }

    // Validate: add-on exists and is configured in Stripe
    const addon = await this.addonsRepository.findByKey(addonKey);
    if (!addon) {
      throw new NotFoundException(`Add-on not found: ${addonKey}`);
    }
    if (!addon.stripe_price_id) {
      throw new NotFoundException(
        `Add-on not configured in Stripe: ${addonKey}`,
      );
    }

    // Guard: no duplicate active add-on
    const activeAddons =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.tenantAddonsRepository.findActiveByTenant(tenantId, { client }),
      );
    if (activeAddons.some((a) => a.addon_id === addon.id)) {
      throw new BadRequestException(
        'Add-on already active. Use update to change quantity.',
      );
    }

    // Create Stripe subscription item — done outside any DB transaction because
    // Stripe calls are not rollbackable. DB write only happens on Stripe success.
    const subscriptionItem =
      await this.stripeService.client.subscriptionItems.create({
        subscription: subscription.stripe_subscription_id,
        price: addon.stripe_price_id,
        quantity,
        metadata: {
          complytude_tenant_id: tenantId,
          complytude_addon_key: addonKey,
        },
        proration_behavior: 'create_prorations',
      });

    this.logger.log(
      `Created Stripe subscription item: ${subscriptionItem.id} for tenant=${tenantId}, addon=${addonKey}`,
    );

    // Persist to DB + invalidate snapshot
    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.tenantAddonsRepository.create(
          {
            tenant_id: tenantId,
            addon_id: addon.id,
            quantity,
            status: 'active',
            starts_at: new Date(),
            stripe_subscription_item_id: subscriptionItem.id,
          },
          { client },
        );
        await this.entitlementSnapshotService.invalidate(
          tenantId,
          'addon_added',
          { client },
        );
      },
    );

    // Return enriched result
    const addons =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.tenantAddonsRepository.findActiveByTenantWithEntitlements(
          tenantId,
          { client },
        ),
      );
    const created = addons.find((a) => a.addon_id === addon.id);
    if (!created) {
      throw new Error('Failed to retrieve created add-on after write');
    }

    return created;
  }

  /**
   * Update the quantity of an active add-on in Stripe and our DB.
   */
  async updateAddonQuantity(
    tenantId: string,
    tenantAddonId: string,
    newQuantity: number,
  ): Promise<TenantAddonWithEntitlements> {
    const tenantAddon =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.tenantAddonsRepository.findByIdAndTenant(tenantAddonId, tenantId, {
          client,
        }),
      );

    if (!tenantAddon) {
      throw new NotFoundException('Add-on not found');
    }
    if (!tenantAddon.stripe_subscription_item_id) {
      throw new BadRequestException(
        'Add-on is not linked to a Stripe subscription item',
      );
    }

    // Update Stripe first — DB write only on success
    await this.stripeService.client.subscriptionItems.update(
      tenantAddon.stripe_subscription_item_id,
      {
        quantity: newQuantity,
        proration_behavior: 'create_prorations',
      },
    );

    this.logger.log(
      `Updated Stripe subscription item: ${tenantAddon.stripe_subscription_item_id} → quantity=${newQuantity}`,
    );

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.tenantAddonsRepository.update(
          tenantAddonId,
          { quantity: newQuantity },
          { client },
        );
        await this.entitlementSnapshotService.invalidate(
          tenantId,
          'addon_updated',
          { client },
        );
      },
    );

    // Return enriched result
    const addons =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.tenantAddonsRepository.findByTenantIdWithEntitlements(tenantId, {
          client,
        }),
      );
    const updated = addons.find((a) => a.id === tenantAddonId);
    if (!updated) {
      throw new NotFoundException('Add-on not found after update');
    }

    return updated;
  }

  /**
   * Remove an add-on from the tenant's Stripe subscription.
   * Deletes the subscription item in Stripe and marks the record as cancelled.
   */
  async removeAddon(tenantId: string, tenantAddonId: string): Promise<void> {
    const tenantAddon =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.tenantAddonsRepository.findByIdAndTenant(tenantAddonId, tenantId, {
          client,
        }),
      );

    if (!tenantAddon) {
      throw new NotFoundException('Add-on not found');
    }
    if (!tenantAddon.stripe_subscription_item_id) {
      throw new BadRequestException(
        'Add-on is not linked to a Stripe subscription item',
      );
    }

    // Delete from Stripe first — DB update only on success
    await this.stripeService.client.subscriptionItems.del(
      tenantAddon.stripe_subscription_item_id,
      { proration_behavior: 'create_prorations' },
    );

    this.logger.log(
      `Deleted Stripe subscription item: ${tenantAddon.stripe_subscription_item_id} for tenant=${tenantId}`,
    );

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
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
      },
    );
  }
}
