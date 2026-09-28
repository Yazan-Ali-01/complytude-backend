import { EntitlementQuotaExceededJobData, Job } from '@lib/queue';
import { RedisService } from '@lib/redis';
import { Injectable, Logger } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import {
  FEATURE_CATALOG,
  getFeatureDefinition,
} from 'src/common/constants/plan-entitlements.constant';
import { FeatureKey } from 'src/common/types/entitlement.types';
import { EmailService } from '../../email/email.service';
import { TenantContactsService } from '../../email/tenant-contacts.service';

/** One email per tenant, feature and month; the key outlives the month it covers. */
const NOTIFY_WINDOW_SECONDS = 32 * 24 * 60 * 60;

/**
 * Quota Exceeded Handler
 *
 * Handles QUOTA_EXCEEDED jobs when entitlement checks deny due to quota: emails the tenant's
 * admins an upgrade prompt, at most once per feature per calendar month (every refused request
 * queues a job).
 */
@Injectable()
export class QuotaExceededHandler {
  private readonly logger = new Logger(QuotaExceededHandler.name);

  constructor(
    private readonly redis: RedisService,
    private readonly contacts: TenantContactsService,
    private readonly emailService: EmailService,
    private readonly i18n: I18nService,
  ) {}

  async execute(job: Job<EntitlementQuotaExceededJobData>): Promise<void> {
    const { tenantId, featureKey, requestedUnits, limit, used, reason } =
      job.data;

    this.logger.debug(
      `Quota exceeded: tenant=${tenantId} feature=${featureKey} requested=${requestedUnits} limit=${limit} used=${used} reason=${reason}`,
    );

    // A past-due tenant is refused for payment, not quota; the dunning emails cover that
    if (reason === 'payment_required' || !(featureKey in FEATURE_CATALOG)) {
      return;
    }

    const month = new Date().toISOString().slice(0, 7);
    const first = await this.redis.setIfAbsent(
      `notify:quota-exceeded:${tenantId}:${featureKey}:${month}`,
      true,
      NOTIFY_WINDOW_SECONDS,
    );
    if (!first) return;

    const contacts = await this.contacts.resolve(tenantId);
    if (!contacts || contacts.recipients.length === 0) {
      this.logger.warn(`Quota email: no recipients for tenant ${tenantId}`);
      return;
    }

    const featureName = this.i18n.t(
      `email.quota_exceeded.features.${featureKey}`,
      {
        lang: contacts.locale,
        defaultValue:
          getFeatureDefinition(featureKey as FeatureKey)?.name ?? featureKey,
      },
    );
    await this.emailService.sendQuotaExceededEmail(
      {
        recipients: contacts.recipients,
        tenantName: contacts.tenantName,
        featureName,
        limit,
      },
      contacts.locale,
    );
  }
}
