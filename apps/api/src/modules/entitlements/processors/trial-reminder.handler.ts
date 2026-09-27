import { DatabaseService } from '@lib/database';
import type { EntitlementTrialReminderCheckJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantSubscription } from 'src/common/types/entitlement.types';
import { EmailService } from 'src/modules/email/email.service';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';

const BATCH_SIZE = 100;

/**
 * Reminder window (days from now). Inclusive lower bound, exclusive upper.
 * 3 → wider start so a missed cron tick still picks up the row on the next run.
 * The `trial_reminder_sent_at` flag prevents double-sends across retries.
 */
const REMINDER_WINDOW_START_DAYS = 2;
const REMINDER_WINDOW_END_DAYS = 4;

/**
 * Trial Reminder Handler
 *
 * Sends a one-shot "trial ending soon" email to tenants whose 14-day trial is
 * ~3 days away from expiring. Pairs with `TrialExpiryHandler`, which performs
 * the actual downgrade once `trial_ends_at <= now()`.
 *
 * Idempotency:
 * - `findTrialsEndingSoon` filters out rows with `trial_reminder_sent_at IS NOT NULL`
 * - `markTrialReminderSent` is called per row after a successful send
 * - Per-row failures are logged and retried on the next cron tick (the row
 *   stays unmarked, the window is wide enough that it stays eligible)
 */
@Injectable()
export class TrialReminderHandler {
  private readonly logger = new Logger(TrialReminderHandler.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async execute(job: Job<EntitlementTrialReminderCheckJobData>): Promise<void> {
    this.logger.log(
      `Trial reminder check started: jobId=${job.id}, triggeredAt=${job.data.triggeredAt}`,
    );

    let totalSent = 0;
    let totalFailed = 0;
    let batch: TenantSubscription[];

    do {
      batch = await this.databaseService.transactionWithPlatformAdminContext(
        async (client) =>
          this.subscriptionsRepository.findTrialsEndingSoon(
            REMINDER_WINDOW_START_DAYS,
            REMINDER_WINDOW_END_DAYS,
            BATCH_SIZE,
            { client },
          ),
      );

      if (batch.length === 0) {
        break;
      }

      this.logger.log(`Processing ${batch.length} trial reminder(s)`);

      for (const subscription of batch) {
        try {
          await this.processSubscription(subscription);
          totalSent++;
        } catch (error) {
          totalFailed++;
          this.logger.error(
            `Failed to send trial reminder for subscription=${subscription.id} tenant=${subscription.tenant_id}: ${(error as Error).message}`,
            (error as Error).stack,
          );
        }
      }
    } while (batch.length === BATCH_SIZE);

    this.logger.log(
      `Trial reminder check complete: sent=${totalSent}, failed=${totalFailed}`,
    );
  }

  private async processSubscription(
    subscription: TenantSubscription,
  ): Promise<void> {
    if (!subscription.trial_ends_at) {
      this.logger.warn(
        `Subscription ${subscription.id} matched the reminder query but has no trial_ends_at; skipping`,
      );
      return;
    }

    // Re-read subscription, tenant, and tenant_admin email in a single
    // platform-admin transaction. The fresh read closes the race where a
    // tenant upgrades (or the trial expires/cancels) between the batch SELECT
    // and the email dispatch — without it, an upgraded user could still get
    // a "trial ending soon" email a few hundred ms after Stripe webhook lands.
    const ctx = await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const fresh = await this.subscriptionsRepository.findActiveByTenant(
          subscription.tenant_id,
          { client },
        );
        if (
          !fresh ||
          fresh.id !== subscription.id ||
          fresh.status !== 'trialing' ||
          !fresh.trial_ends_at ||
          fresh.trial_reminder_sent_at !== null
        ) {
          return null;
        }
        const tenantAdminEmail =
          await this.userTenantRepository.findTenantAdminEmail(
            subscription.tenant_id,
            { client },
          );
        const tenant = await this.tenantRepository.findById(
          subscription.tenant_id,
          { client },
        );
        return { fresh, tenantAdminEmail, tenant };
      },
    );

    if (!ctx) {
      this.logger.log(
        `Trial reminder skipped: subscription=${subscription.id} tenant=${subscription.tenant_id} no longer eligible (upgraded, expired, cancelled, or already reminded)`,
      );
      return;
    }

    if (!ctx.tenant) {
      this.logger.warn(
        `Subscription ${subscription.id}: tenant ${subscription.tenant_id} not found; skipping`,
      );
      return;
    }

    const toAddresses = [
      ctx.tenantAdminEmail ?? null,
      ctx.tenant.billing_email ?? null,
    ].filter((e): e is string => !!e);

    if (toAddresses.length === 0) {
      this.logger.warn(
        `Subscription ${subscription.id}: no recipients (no tenant_admin email or billing_email); marking as sent to avoid retries`,
      );
      // Still mark as sent — there's no one to email and we don't want the row
      // to spin in the reminder window every 6 hours.
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.subscriptionsRepository.markTrialReminderSent(subscription.id, {
          client,
        }),
      );
      return;
    }

    const trialEndsAt = ctx.fresh.trial_ends_at!;
    const daysRemaining = this.computeDaysRemaining(trialEndsAt);
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const upgradeUrl = `${frontendUrl}/billing/upgrade`;

    const locale = ctx.tenant.locale ?? 'en';

    await this.emailService.sendTrialEndingEmail(
      {
        recipients: toAddresses,
        tenantName: ctx.tenant.name ?? undefined,
        daysRemaining,
        trialEndsAt,
        upgradeUrl,
      },
      locale,
    );

    await this.databaseService.transactionWithPlatformAdminContext((client) =>
      this.subscriptionsRepository.markTrialReminderSent(subscription.id, {
        client,
      }),
    );

    this.logger.log(
      `Trial reminder sent: subscription=${subscription.id} tenant=${subscription.tenant_id} recipients=${toAddresses.length} daysRemaining=${daysRemaining}`,
    );
  }

  /**
   * Compute whole days remaining (rounded up) until the trial ends.
   * Always at least 1 to avoid emailing "0 days remaining".
   */
  private computeDaysRemaining(trialEndsAt: Date): number {
    const ms = trialEndsAt.getTime() - Date.now();
    if (ms <= 0) return 1;
    return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  }
}
