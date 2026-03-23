import { EntitlementQuotaExceededJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Quota Exceeded Handler
 *
 * Handles QUOTA_EXCEEDED jobs when entitlement checks deny due to quota.
 * Sends upgrade prompts to tenant admins.
 *
 * Current: Logs event. Future: email tenant admin with upgrade CTA.
 */
@Injectable()
export class QuotaExceededHandler {
  private readonly logger = new Logger(QuotaExceededHandler.name);

  execute(job: Job<EntitlementQuotaExceededJobData>): Promise<void> {
    const { tenantId, featureKey, requestedUnits, limit, used, reason } =
      job.data;

    this.logger.debug(
      `Quota exceeded: tenant=${tenantId} feature=${featureKey} requested=${requestedUnits} limit=${limit} used=${used} reason=${reason}`,
    );

    // TODO: Email tenant admin with upgrade prompt
    return Promise.resolve();
  }
}
