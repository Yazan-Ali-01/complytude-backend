import { Injectable, Logger } from '@nestjs/common';
import { TenantSubscription } from 'src/common/types/entitlement.types';
import { DatabaseService } from 'src/database/database.service';
import { DomainEventsService } from 'src/modules/entitlements/services/domain-events.service';
import { AddonsRepository } from 'src/repositories/entitlements/addons.repository';
import { EntitlementSnapshotsRepository } from 'src/repositories/entitlements/entitlement-snapshots.repository';
import { TenantAddonsRepository } from 'src/repositories/entitlements/tenant-addons.repository';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import { StripeService } from '../stripe.service';
import {
  mapStripeStatusToInternal,
  RECONCILIATION_BATCH_SIZE,
  RECONCILIATION_BATCH_DELAY_MS,
} from '../stripe.utils';
import {
  AddonSyncEngine,
  AddonSyncMutation as _AddonSyncMutation,
} from './addon-sync-engine.service';

export interface ReconciliationError {
  type: string;
  tenant_id: string;
  stripe_id: string;
  error?: string;
  expected?: string;
  actual?: string;
}

export interface ReconciliationReport {
  checked: number;
  in_sync: number;
  drifted: number;
  fixed: number;
  errors: ReconciliationError[];
}

@Injectable()
export class StripeReconciliationService {
  private readonly logger = new Logger(StripeReconciliationService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly stripeService: StripeService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly plansRepository: PlansRepository,
    private readonly entitlementSnapshotsRepository: EntitlementSnapshotsRepository,
    private readonly domainEventsService: DomainEventsService,
    private readonly addonsRepository: AddonsRepository,
    private readonly tenantAddonsRepository: TenantAddonsRepository,
    private readonly addonSyncEngine: AddonSyncEngine,
  ) {}

  async reconcileAll(): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      checked: 0,
      in_sync: 0,
      drifted: 0,
      fixed: 0,
      errors: [],
    };

    await this.reconcileSubscriptions(report);
    await this.reconcileAddons(report);

    this.logger.log(
      `Reconciliation complete: checked=${report.checked} in_sync=${report.in_sync} ` +
        `drifted=${report.drifted} fixed=${report.fixed} errors=${report.errors.length}`,
    );

    return report;
  }

  // ─── Subscription reconciliation ──────────────────────────────────────────

  private async reconcileSubscriptions(
    report: ReconciliationReport,
  ): Promise<void> {
    const subscriptions =
      await this.subscriptionsRepository.findAllWithStripeId();

    this.logger.log(
      `Reconciling ${subscriptions.length} subscription(s) with Stripe IDs`,
    );

    for (let i = 0; i < subscriptions.length; i += RECONCILIATION_BATCH_SIZE) {
      const batch = subscriptions.slice(i, i + RECONCILIATION_BATCH_SIZE);
      await Promise.all(
        batch.map((sub) => this.reconcileSubscription(sub, report)),
      );
      if (i + RECONCILIATION_BATCH_SIZE < subscriptions.length) {
        await this.delay(RECONCILIATION_BATCH_DELAY_MS);
      }
    }
  }

  private async reconcileSubscription(
    sub: TenantSubscription,
    report: ReconciliationReport,
  ): Promise<void> {
    report.checked++;

    try {
      const stripeSub = await this.stripeService.client.subscriptions.retrieve(
        sub.stripe_subscription_id!,
      );

      // Stripe API 2026-02-25: period dates live on items.data[0], not root.
      const firstItem = stripeSub.items.data[0];
      if (!firstItem?.current_period_start || !firstItem?.current_period_end) {
        report.errors.push({
          type: 'missing_period',
          tenant_id: sub.tenant_id,
          stripe_id: sub.stripe_subscription_id!,
          error: 'Stripe subscription has no items or missing billing period',
        });
        return;
      }

      const stripeStartDate = new Date(firstItem.current_period_start * 1000);
      const stripeEndDate = new Date(firstItem.current_period_end * 1000);

      const expectedStatus = mapStripeStatusToInternal(stripeSub.status);
      const statusDrift = sub.status !== expectedStatus;

      const periodDrift =
        Math.abs(sub.current_period_end.getTime() - stripeEndDate.getTime()) >
        60_000;

      const currentPriceId =
        typeof firstItem.price === 'string'
          ? firstItem.price
          : firstItem.price.id;
      const expectedPlan =
        await this.plansRepository.findByStripePriceId(currentPriceId);
      const planDrift = expectedPlan != null && sub.plan_id !== expectedPlan.id;

      const hasDrift = statusDrift || periodDrift || planDrift;

      if (!hasDrift) {
        report.in_sync++;
        return;
      }

      if (statusDrift) {
        report.drifted++;
        report.errors.push({
          type: 'status_mismatch',
          tenant_id: sub.tenant_id,
          stripe_id: sub.stripe_subscription_id!,
          expected: expectedStatus,
          actual: sub.status,
        });
      }
      if (periodDrift) report.drifted++;
      if (planDrift) report.drifted++;

      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) => {
          await this.subscriptionsRepository.update(
            sub.id,
            {
              ...(statusDrift
                ? { status: expectedStatus, stripe_status: stripeSub.status }
                : {}),
              ...(periodDrift
                ? {
                    current_period_start: stripeStartDate,
                    current_period_end: stripeEndDate,
                    stripe_current_period_end: stripeEndDate,
                  }
                : {}),
              ...(planDrift && expectedPlan
                ? { plan_id: expectedPlan.id }
                : {}),
            },
            { client },
          );

          if (planDrift) {
            await this.entitlementSnapshotsRepository.invalidate(
              sub.tenant_id,
              { client },
            );
          }

          await this.domainEventsService.emit(
            {
              tenant_id: sub.tenant_id,
              event_type: 'subscription.reconciled',
              aggregate_type: 'subscription',
              aggregate_id: sub.id,
              actor_type: 'system',
              payload: JSON.stringify({
                fixes: {
                  ...(statusDrift
                    ? { status: { old: sub.status, new: expectedStatus } }
                    : {}),
                  ...(periodDrift
                    ? {
                        period_end: {
                          old: sub.current_period_end,
                          new: stripeEndDate,
                        },
                      }
                    : {}),
                  ...(planDrift && expectedPlan
                    ? { plan_id: { old: sub.plan_id, new: expectedPlan.id } }
                    : {}),
                },
              }),
              metadata: JSON.stringify({
                timestamp: new Date().toISOString(),
                source: 'stripe_reconciliation',
              }),
            },
            { client },
          );
        },
      );

      report.fixed++;
      this.logger.log(
        `Subscription reconciled: tenant=${sub.tenant_id} stripe_sub=${sub.stripe_subscription_id} ` +
          `fixes=${JSON.stringify({ statusDrift, periodDrift, planDrift })}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to reconcile subscription for tenant=${sub.tenant_id} stripe_sub=${sub.stripe_subscription_id}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      report.errors.push({
        type: 'stripe_api_error',
        tenant_id: sub.tenant_id,
        stripe_id: sub.stripe_subscription_id!,
        error: message,
      });
    }
  }

  // ─── Add-on reconciliation ─────────────────────────────────────────────────

  private async reconcileAddons(report: ReconciliationReport): Promise<void> {
    const subscriptions =
      await this.subscriptionsRepository.findAllWithStripeId();

    for (let i = 0; i < subscriptions.length; i += RECONCILIATION_BATCH_SIZE) {
      const batch = subscriptions.slice(i, i + RECONCILIATION_BATCH_SIZE);
      await Promise.all(
        batch.map((sub) => this.reconcileAddonsForSubscription(sub, report)),
      );
      if (i + RECONCILIATION_BATCH_SIZE < subscriptions.length) {
        await this.delay(RECONCILIATION_BATCH_DELAY_MS);
      }
    }
  }

  private async reconcileAddonsForSubscription(
    sub: TenantSubscription,
    report: ReconciliationReport,
  ): Promise<void> {
    try {
      const stripeSub = await this.stripeService.client.subscriptions.retrieve(
        sub.stripe_subscription_id!,
      );

      // Use shared engine to analyze drift
      const { mutations, addonCatalog, stripeItemMap } =
        await this.addonSyncEngine.analyzeSync(sub.tenant_id, stripeSub);

      // Count items checked and in sync for reporting
      const addonStripeItems = stripeSub.items.data.filter((item) => {
        const priceId =
          typeof item.price === 'string' ? item.price : item.price.id;
        return addonCatalog.has(priceId);
      });

      report.checked += addonStripeItems.length;
      report.in_sync += addonStripeItems.length - mutations.length;

      if (mutations.length === 0) return;

      report.drifted += mutations.length;

      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) => {
          // Execute mutations using shared engine
          await this.addonSyncEngine.executeMutations(
            mutations,
            addonCatalog,
            stripeItemMap,
            {
              tenantId: sub.tenant_id,
              client,
              context: 'reconciliation',
            },
          );

          await this.entitlementSnapshotsRepository.invalidate(sub.tenant_id, {
            client,
          });

          await this.domainEventsService.emit(
            {
              tenant_id: sub.tenant_id,
              event_type: 'addon.reconciled',
              aggregate_type: 'tenant_addon',
              aggregate_id: sub.id,
              actor_type: 'system',
              payload: JSON.stringify({
                fixes: mutations.map((m) => ({
                  type: m.type,
                  stripe_item_id: m.stripeItemId,
                  addon_key: m.addonKey,
                })),
              }),
              metadata: JSON.stringify({
                timestamp: new Date().toISOString(),
                source: 'stripe_reconciliation',
              }),
            },
            { client },
          );
        },
      );

      report.fixed += mutations.length;
      this.logger.log(
        `Add-on reconciliation: tenant=${sub.tenant_id} fixes=${mutations.length} ` +
          `(${mutations.map((m) => m.type).join(', ')})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Add-on reconciliation failed for tenant=${sub.tenant_id}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      report.errors.push({
        type: 'addon_reconciliation_error',
        tenant_id: sub.tenant_id,
        stripe_id: sub.stripe_subscription_id!,
        error: message,
      });
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
