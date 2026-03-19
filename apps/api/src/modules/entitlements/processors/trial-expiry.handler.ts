import { DatabaseService } from '@lib/database';
import type { EntitlementTrialExpiryCheckJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { TRIAL_CONFIG } from 'src/common/constants/trial-config.constant';
import { EntitlementSnapshotsRepository } from 'src/repositories/entitlements/entitlement-snapshots.repository';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import { DomainEventsService } from '../services/domain-events.service';

const BATCH_SIZE = 100;

/**
 * Trial Expiry Handler
 *
 * Processes expired trial subscriptions in batches. For each expired trial:
 * - Updates status to 'active', plan to Navigator
 * - Sets new billing period (now → +1 month)
 * - Clears trial_ends_at
 * - Invalidates entitlement snapshot
 * - Emits trial.expired domain event
 *
 * Idempotent: running twice doesn't double-downgrade (query only finds status='trialing').
 */
@Injectable()
export class TrialExpiryHandler {
  private readonly logger = new Logger(TrialExpiryHandler.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly plansRepository: PlansRepository,
    private readonly entitlementSnapshotsRepository: EntitlementSnapshotsRepository,
    private readonly domainEventsService: DomainEventsService,
  ) {}

  async execute(job: Job<EntitlementTrialExpiryCheckJobData>): Promise<void> {
    this.logger.log(
      `Trial expiry check started: jobId=${job.id}, triggeredAt=${job.data.triggeredAt}`,
    );

    const navigatorPlan =
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) =>
          this.plansRepository.findByKey(TRIAL_CONFIG.EXPIRY_PLAN_KEY, {
            client,
          }),
      );

    if (!navigatorPlan) {
      this.logger.error(
        `Navigator plan not found - cannot process trial expirations. Ensure plan '${TRIAL_CONFIG.EXPIRY_PLAN_KEY}' exists.`,
      );
      return;
    }

    const expiredSubscriptions =
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) =>
          this.subscriptionsRepository.findExpiredTrials(BATCH_SIZE, {
            client,
          }),
      );

    this.logger.log(
      `Found ${expiredSubscriptions.length} expired trial(s) to process`,
    );

    for (const subscription of expiredSubscriptions) {
      try {
        await this.databaseService.transactionWithPlatformAdminContext(
          async (client) => {
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setMonth(periodEnd.getMonth() + 1);

            const updated =
              await this.subscriptionsRepository.updateForTrialExpiry(
                subscription.id,
                navigatorPlan.id,
                now,
                periodEnd,
                { client },
              );

            await this.entitlementSnapshotsRepository.invalidate(
              subscription.tenant_id,
              { client },
            );

            await this.domainEventsService.emit(
              {
                tenant_id: subscription.tenant_id,
                event_type: 'trial.expired',
                aggregate_type: 'subscription',
                aggregate_id: updated.id,
                actor_id: undefined,
                actor_type: 'system',
                payload: JSON.stringify({
                  tenantId: subscription.tenant_id,
                  previousPlanKey: TRIAL_CONFIG.PLAN_KEY,
                  newPlanKey: TRIAL_CONFIG.EXPIRY_PLAN_KEY,
                }),
                metadata: JSON.stringify({
                  timestamp: new Date().toISOString(),
                }),
              },
              { client },
            );

            this.logger.log(
              `Trial expired: tenant=${subscription.tenant_id}, downgraded to ${TRIAL_CONFIG.EXPIRY_PLAN_KEY}`,
            );
          },
        );
      } catch (error) {
        this.logger.error(
          `Failed to expire trial for tenant=${subscription.tenant_id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }

    this.logger.log(
      `Trial expiry check complete: processed ${expiredSubscriptions.length} subscription(s)`,
    );
  }
}
