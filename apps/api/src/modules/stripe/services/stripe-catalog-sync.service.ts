import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  ALL_PLANS,
  PlanDefinition,
} from 'src/common/constants/plan-entitlements.constant';
import { Addon, Plan } from 'src/common/types/entitlement.types';
import { AddonsRepository } from 'src/repositories/entitlements/addons.repository';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import { StripeService } from '../stripe.service';

/**
 * StripeCatalogSyncService
 *
 * Syncs the plan and add-on catalog from code constants to Stripe Products and Prices
 * on every app startup. This ensures Stripe always mirrors our source of truth.
 *
 * Run order: runs AFTER EntitlementSyncService (StripeModule loads after EntitlementsModule).
 * Enable via: STRIPE_CATALOG_SYNC_ENABLED=true
 *
 * Idempotency:
 * - Products: check DB stripe_product_id first; fall back to Stripe metadata search.
 * - Prices: Stripe prices are immutable — archive and recreate if amount changed.
 */
@Injectable()
export class StripeCatalogSyncService implements OnModuleInit {
  private readonly logger = new Logger(StripeCatalogSyncService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly plansRepository: PlansRepository,
    private readonly addonsRepository: AddonsRepository,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.configService.get<boolean>(
      'STRIPE_CATALOG_SYNC_ENABLED',
      false,
    );
    if (!enabled) {
      this.logger.log(
        'Stripe catalog sync disabled (STRIPE_CATALOG_SYNC_ENABLED=false)',
      );
      return;
    }

    this.logger.log('Starting Stripe catalog sync...');
    try {
      await this.syncPlans();
      await this.syncAddons();
      this.logger.log('Stripe catalog sync completed successfully');
    } catch (error) {
      // Don't crash the app if Stripe is unreachable
      this.logger.error(
        'Stripe catalog sync failed — app will continue without complete sync',
        error,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Plans
  // ---------------------------------------------------------------------------

  private async syncPlans(): Promise<void> {
    const paidPlans = ALL_PLANS.filter((p) => p.key !== 'navigator');
    this.logger.log(`Syncing ${paidPlans.length} paid plans to Stripe...`);

    for (const plan of paidPlans) {
      try {
        await this.syncPlanToStripe(plan);
      } catch (error) {
        this.logger.error(`Failed to sync plan "${plan.key}"`, error);
      }
    }
  }

  private async syncPlanToStripe(plan: PlanDefinition): Promise<void> {
    const dbPlan = await this.plansRepository.findByKey(plan.key);
    if (!dbPlan) {
      this.logger.error(`Plan not found in DB: ${plan.key} — skipping`);
      return;
    }

    const stripeProductId = await this.resolveOrCreateProduct({
      existingStripeProductId: dbPlan.stripe_product_id,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      internalId: dbPlan.id,
      type: 'plan',
    });

    if (!dbPlan.stripe_product_id) {
      await this.plansRepository.updateStripeProductId(
        dbPlan.id,
        stripeProductId,
      );
    }

    const planWithProductId: Plan = {
      ...dbPlan,
      stripe_product_id: stripeProductId,
    };

    await this.syncPlanPrice(planWithProductId, 'monthly', plan.price_monthly);

    const annualAmount = plan.price_monthly * 10; // 10 months = 2 months free
    await this.syncPlanPrice(planWithProductId, 'annual', annualAmount);
  }

  private async syncPlanPrice(
    plan: Plan,
    interval: 'monthly' | 'annual',
    amount: number,
  ): Promise<void> {
    const existingPriceId =
      interval === 'monthly'
        ? plan.stripe_price_id_monthly
        : plan.stripe_price_id_annual;

    const stripeInterval: 'month' | 'year' =
      interval === 'monthly' ? 'month' : 'year';
    const amountInFils = Math.round(amount * 100);

    if (existingPriceId) {
      const existing =
        await this.stripeService.client.prices.retrieve(existingPriceId);
      if (existing.unit_amount !== amountInFils) {
        this.logger.log(
          `Price amount changed for plan "${plan.key}" ${interval}: ` +
            `${existing.unit_amount} → ${amountInFils}. Archiving old price and creating new.`,
        );
        await this.stripeService.client.prices.update(existingPriceId, {
          active: false,
        });
        const newPrice = await this.createPlanPrice(
          plan,
          interval,
          stripeInterval,
          amountInFils,
        );
        await this.plansRepository.updateStripePriceId(
          plan.id,
          interval,
          newPrice.id,
        );
        this.logger.log(
          `Created new ${interval} price for plan "${plan.key}": ${newPrice.id}`,
        );
      } else {
        this.logger.log(
          `${interval} price for plan "${plan.key}" unchanged: ${existingPriceId}`,
        );
      }
      return;
    }

    // No price in DB — check Stripe first to avoid duplicates
    const recovered = await this.findExistingActivePrice(
      plan.stripe_product_id!,
      stripeInterval,
      amountInFils,
    );
    if (recovered) {
      await this.plansRepository.updateStripePriceId(
        plan.id,
        interval,
        recovered.id,
      );
      this.logger.log(
        `Recovered existing ${interval} price for plan "${plan.key}": ${recovered.id}`,
      );
      return;
    }

    const price = await this.createPlanPrice(
      plan,
      interval,
      stripeInterval,
      amountInFils,
    );
    await this.plansRepository.updateStripePriceId(plan.id, interval, price.id);
    this.logger.log(
      `Created ${interval} price for plan "${plan.key}": ${price.id}`,
    );
  }

  private createPlanPrice(
    plan: Plan,
    interval: 'monthly' | 'annual',
    stripeInterval: 'month' | 'year',
    amountInFils: number,
  ): Promise<Stripe.Price> {
    return this.stripeService.client.prices.create({
      product: plan.stripe_product_id!,
      unit_amount: amountInFils,
      currency: 'aed',
      recurring: { interval: stripeInterval },
      metadata: {
        plan_key: plan.key,
        interval,
        complytude_plan_id: plan.id,
      },
      tax_behavior: 'exclusive',
    });
  }

  // ---------------------------------------------------------------------------
  // Add-ons
  // ---------------------------------------------------------------------------

  private async syncAddons(): Promise<void> {
    const addons = await this.addonsRepository.findAllActive();
    this.logger.log(`Syncing ${addons.length} add-ons to Stripe...`);

    for (const addon of addons) {
      try {
        await this.syncAddonToStripe(addon);
      } catch (error) {
        this.logger.error(`Failed to sync addon "${addon.key}"`, error);
      }
    }
  }

  private async syncAddonToStripe(addon: Addon): Promise<void> {
    const stripeProductId = await this.resolveOrCreateProduct({
      existingStripeProductId: addon.stripe_product_id,
      key: addon.key,
      name: addon.name,
      description: addon.description,
      internalId: addon.id,
      type: 'addon',
    });

    if (!addon.stripe_product_id) {
      await this.addonsRepository.updateStripeProductId(
        addon.id,
        stripeProductId,
      );
    }

    await this.syncAddonPrice({ ...addon, stripe_product_id: stripeProductId });
  }

  private async syncAddonPrice(addon: Addon): Promise<void> {
    const amountInFils = Math.round(addon.price_monthly * 100);

    if (addon.stripe_price_id) {
      const existing = await this.stripeService.client.prices.retrieve(
        addon.stripe_price_id,
      );
      if (existing.unit_amount !== amountInFils) {
        this.logger.log(
          `Price amount changed for addon "${addon.key}": ` +
            `${existing.unit_amount} → ${amountInFils}. Archiving old price and creating new.`,
        );
        await this.stripeService.client.prices.update(addon.stripe_price_id, {
          active: false,
        });
        const newPrice = await this.createAddonPrice(addon, amountInFils);
        await this.addonsRepository.updateStripePriceId(addon.id, newPrice.id);
        this.logger.log(
          `Created new price for addon "${addon.key}": ${newPrice.id}`,
        );
      } else {
        this.logger.log(
          `Price for addon "${addon.key}" unchanged: ${addon.stripe_price_id}`,
        );
      }
      return;
    }

    const recovered = await this.findExistingActivePrice(
      addon.stripe_product_id!,
      'month',
      amountInFils,
    );
    if (recovered) {
      await this.addonsRepository.updateStripePriceId(addon.id, recovered.id);
      this.logger.log(
        `Recovered existing price for addon "${addon.key}": ${recovered.id}`,
      );
      return;
    }

    const price = await this.createAddonPrice(addon, amountInFils);
    await this.addonsRepository.updateStripePriceId(addon.id, price.id);
    this.logger.log(`Created price for addon "${addon.key}": ${price.id}`);
  }

  private createAddonPrice(
    addon: Addon,
    amountInFils: number,
  ): Promise<Stripe.Price> {
    return this.stripeService.client.prices.create({
      product: addon.stripe_product_id!,
      unit_amount: amountInFils,
      currency: 'aed',
      recurring: { interval: 'month' },
      metadata: {
        addon_key: addon.key,
        complytude_addon_id: addon.id,
      },
      tax_behavior: 'exclusive',
    });
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve or create a Stripe product.
   * If stripe_product_id is in our DB: update the product metadata/name.
   * If missing: search Stripe by metadata key before creating (idempotency).
   */
  private async resolveOrCreateProduct({
    existingStripeProductId,
    key,
    name,
    description,
    internalId,
    type,
  }: {
    existingStripeProductId: string | null | undefined;
    key: string;
    name: string;
    description: string | undefined;
    internalId: string;
    type: 'plan' | 'addon';
  }): Promise<string> {
    const metadataKey = type === 'plan' ? 'plan_key' : 'addon_key';
    const metadataIdKey =
      type === 'plan' ? 'complytude_plan_id' : 'complytude_addon_id';
    const metadata = {
      [metadataKey]: key,
      [metadataIdKey]: internalId,
    };

    if (existingStripeProductId) {
      await this.stripeService.client.products.update(existingStripeProductId, {
        name,
        description: description ?? '',
        metadata,
      });
      this.logger.log(
        `Updated Stripe product for ${type} "${key}": ${existingStripeProductId}`,
      );
      return existingStripeProductId;
    }

    // Search by metadata to recover the product if our DB lost the ID
    const search = await this.stripeService.client.products.search({
      query: `metadata['${metadataKey}']:'${key}'`,
      limit: 1,
    });

    if (search.data.length > 0) {
      const product = search.data[0];
      this.logger.log(
        `Recovered existing Stripe product for ${type} "${key}": ${product.id}`,
      );
      return product.id;
    }

    const product = await this.stripeService.client.products.create({
      name,
      description: description ?? '',
      metadata,
    });
    this.logger.log(
      `Created Stripe product for ${type} "${key}": ${product.id}`,
    );
    return product.id;
  }

  /**
   * Find an existing active price for a product matching the given interval and amount.
   * Used to recover prices that exist in Stripe but not in our DB (idempotency).
   */
  private async findExistingActivePrice(
    productId: string,
    interval: 'month' | 'year',
    amountInFils: number,
  ): Promise<Stripe.Price | null> {
    const prices = await this.stripeService.client.prices.list({
      product: productId,
      active: true,
      type: 'recurring',
    });

    return (
      prices.data.find(
        (p) =>
          p.unit_amount === amountInFils && p.recurring?.interval === interval,
      ) ?? null
    );
  }
}
