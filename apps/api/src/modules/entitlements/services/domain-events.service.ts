import { DatabaseService, QueryOptions } from '@lib/database';
import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  CreateDomainEventRow,
  DomainEvent,
  DomainEventFilters,
  DomainEventSummary,
} from '../../../common/types/entitlement.types';
import { DomainEventsRepository } from '../../../repositories/domain-events/domain-events.repository';

/**
 * Domain Events Service - Phase 7
 *
 * Core service for managing domain events (append-only audit log).
 *
 * Key responsibilities:
 * - Emit domain events with auto-sequencing
 * - Query events by tenant, type, aggregate, date range
 * - Provide audit trail and event replay capabilities
 * - Support event sourcing patterns
 *
 * Architecture:
 * - All operations use transactionWithTenantContext for RLS
 * - Events are append-only (immutable)
 * - Sequence numbers are auto-computed per aggregate
 * - Events provide full audit trail for reconstructability
 *
 * TODO: BullMQ - Event emission should go through a queue for:
 * - Fan-out to multiple listeners (webhooks, notifications, analytics)
 * - Async processing without blocking the write path
 * - Retry logic for failed event handlers
 * - Event replay and reprocessing capabilities
 *
 * Example BullMQ integration:
 * ```typescript
 * await this.eventQueue.add('domain-event', {
 *   event: domainEvent,
 *   listeners: ['webhook', 'notification', 'analytics'],
 * });
 * ```
 */
@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly domainEventsRepository: DomainEventsRepository,
  ) {}

  /**
   * Emit a domain event with auto-sequencing
   *
   * Computes the next sequence number for the aggregate and appends the event.
   *
   * @param event - Event to emit
   * @param options - Query options (optional client for shared transactions)
   * @returns The emitted domain event
   */
  async emit(
    event: Omit<CreateDomainEventRow, 'sequence_number'>,
    options?: QueryOptions,
  ): Promise<DomainEvent> {
    const execute = async (client: PoolClient) => {
      // Step 1: Acquire advisory lock to prevent race condition on sequence numbers
      // Serializes concurrent emissions for the same aggregate to ensure unique sequence numbers
      const lockKey = `${event.aggregate_type}:${event.aggregate_id}`;
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [
        lockKey,
      ]);

      // Step 2: Get max sequence number for this aggregate
      const latestEvent =
        await this.domainEventsRepository.getLatestByAggregate(
          event.aggregate_type,
          event.aggregate_id,
          { client },
        );

      const nextSequence = (latestEvent?.sequence_number ?? 0) + 1;

      // Step 3: Emit event with computed sequence number
      const emittedEvent = await this.domainEventsRepository.emit(
        {
          ...event,
          sequence_number: nextSequence,
        },
        { client },
      );

      this.logger.debug(
        `Domain event emitted: type=${event.event_type}, aggregate=${event.aggregate_type}/${event.aggregate_id}, seq=${nextSequence}`,
      );

      // TODO: BullMQ - Emit to queue for async fan-out to listeners
      // await this.eventQueue.add('domain-event', { event: emittedEvent });

      return emittedEvent;
    };

    if (options?.client) {
      return execute(options.client);
    }

    // Use tenant context if tenant_id is provided
    if (event.tenant_id) {
      return this.databaseService.transactionWithTenantContext(
        { tenantId: event.tenant_id },
        execute,
      );
    }

    // System events (no tenant context)
    return this.databaseService.transaction(execute);
  }

  /**
   * Get events by tenant with optional filters
   *
   * @param tenantId - Tenant ID
   * @param filters - Optional filters (eventType, aggregateType, date range, pagination)
   * @param options - Query options
   * @returns Paginated list of domain events
   */
  async getEventsByTenant(
    tenantId: string,
    filters?: DomainEventFilters,
    options?: QueryOptions,
  ): Promise<DomainEvent[]> {
    const execute = async (client: PoolClient) => {
      return this.domainEventsRepository.findByTenant(tenantId, filters, {
        client,
      });
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Get events by aggregate (full history)
   *
   * Returns all events for a specific aggregate, ordered by sequence number.
   *
   * @param aggregateType - Aggregate type (e.g., 'usage', 'credit', 'subscription')
   * @param aggregateId - Aggregate ID
   * @param options - Query options
   * @returns Ordered list of events for the aggregate
   */
  async getEventsByAggregate(
    aggregateType: string,
    aggregateId: string,
    tenantId?: string,
    options?: QueryOptions,
  ): Promise<DomainEvent[]> {
    const execute = async (client: PoolClient) => {
      return this.domainEventsRepository.findByAggregate(
        aggregateType,
        aggregateId,
        { client },
      );
    };

    if (options?.client) {
      return execute(options.client);
    }

    if (tenantId) {
      return this.databaseService.transactionWithTenantContext(
        { tenantId },
        execute,
      );
    }

    return this.databaseService.transaction(execute);
  }

  /**
   * Get events by type
   *
   * @param eventType - Event type (e.g., 'usage.recorded', 'credit.deducted')
   * @param tenantId - Optional tenant ID filter
   * @param limit - Max events to return (default 50)
   * @param options - Query options
   * @returns List of events matching the type
   */
  async getEventsByType(
    eventType: string,
    tenantId?: string,
    limit: number = 50,
    options?: QueryOptions,
  ): Promise<DomainEvent[]> {
    const execute = async (client: PoolClient) => {
      return this.domainEventsRepository.findByEventType(
        eventType,
        tenantId,
        limit,
        { client },
      );
    };

    if (options?.client) {
      return execute(options.client);
    }

    if (tenantId) {
      return this.databaseService.transactionWithTenantContext(
        { tenantId },
        execute,
      );
    }

    return this.databaseService.transaction(execute);
  }

  /**
   * Replay events for a tenant
   *
   * Returns all events for a tenant ordered by sequence_number and recorded_at
   * for event sourcing and reconstructability.
   *
   * @param tenantId - Tenant ID
   * @param fromDate - Optional start date (replay from this point)
   * @param options - Query options
   * @returns Ordered list of events for replay
   */
  async replayEvents(
    tenantId: string,
    fromDate?: Date,
    options?: QueryOptions,
  ): Promise<DomainEvent[]> {
    const execute = async (client: PoolClient) => {
      return this.domainEventsRepository.findByTenant(
        tenantId,
        {
          fromDate,
          limit: 1000, // Large limit for replay
          offset: 0,
        },
        { client },
      );
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Get audit trail for a specific resource
   *
   * Cross-references events across usage, credit, and subscription aggregates
   * to build a complete audit trail for a resource (e.g., a usage event and
   * its related credit deduction).
   *
   * @param tenantId - Tenant ID
   * @param resourceType - Resource type (e.g., 'usage', 'credit')
   * @param resourceId - Resource ID
   * @param options - Query options
   * @returns Related events forming the audit trail
   */
  async getAuditTrail(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    options?: QueryOptions,
  ): Promise<DomainEvent[]> {
    const execute = async (client: PoolClient) => {
      // Get primary event
      const primaryEvents = await this.domainEventsRepository.findByAggregate(
        resourceType,
        resourceId,
        { client },
      );

      if (primaryEvents.length === 0) {
        return [];
      }

      const trail: DomainEvent[] = [...primaryEvents];

      // For usage events, find related credit deductions
      if (resourceType === 'usage') {
        for (const event of primaryEvents) {
          if (event.event_type === 'usage.recorded') {
            // Look for credit.deducted events that reference this usage event
            const creditEvents = await this.domainEventsRepository.findByTenant(
              tenantId,
              {
                eventType: 'credit.deducted',
                limit: 100,
              },
              { client },
            );

            // Filter to only those that reference this usage event
            const relatedCredits = creditEvents.filter((ce) => {
              const payload = ce.payload as { usage_ledger_id?: string };
              return payload.usage_ledger_id === resourceId;
            });

            trail.push(...relatedCredits);
          }
        }
      }

      // Sort by recorded_at
      trail.sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());

      return trail;
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Count events for a tenant with optional filters
   *
   * @param tenantId - Tenant ID
   * @param filters - Optional filters
   * @param options - Query options
   * @returns Total count of matching events
   */
  async countEvents(
    tenantId: string,
    filters?: Omit<DomainEventFilters, 'limit' | 'offset'>,
    options?: QueryOptions,
  ): Promise<number> {
    const execute = async (client: PoolClient) => {
      return this.domainEventsRepository.countByTenant(tenantId, filters, {
        client,
      });
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Get event summary (counts grouped by event type)
   *
   * @param tenantId - Tenant ID
   * @param options - Query options
   * @returns Array of event types with counts
   */
  async getEventSummary(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<DomainEventSummary[]> {
    const execute = async (client: PoolClient) => {
      return this.domainEventsRepository.getEventSummary(tenantId, { client });
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }
}
