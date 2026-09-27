import { EntitlementDomainEventFanoutJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Domain Event Fan-out Handler
 *
 * Handles DOMAIN_EVENT_FANOUT jobs for async processing of domain events.
 * Routes to listeners: webhooks, notifications, analytics.
 *
 * Current: Logs event. Future: fan-out to webhook endpoints, notification services.
 */
@Injectable()
export class DomainEventFanoutHandler {
  private readonly logger = new Logger(DomainEventFanoutHandler.name);

  execute(job: Job<EntitlementDomainEventFanoutJobData>): Promise<void> {
    const { eventId, eventType, tenantId, aggregateType, aggregateId } =
      job.data;

    this.logger.debug(
      `Domain event fan-out: type=${eventType} tenant=${tenantId} aggregate=${aggregateType}/${aggregateId} eventId=${eventId}`,
    );

    // TODO: Route to webhooks, notification services, analytics
    // - credit.* → email receipts, low balance alerts
    // - entitlement.denied → upgrade prompts
    return Promise.resolve();
  }
}
