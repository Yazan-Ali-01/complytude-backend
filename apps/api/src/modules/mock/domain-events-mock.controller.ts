import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import { DomainEventsService } from '../entitlements/services/domain-events.service';
import { UsageIngestionService } from '../entitlements/services/usage-ingestion.service';

/**
 * Domain Events Mock Controller - Phase 7 Test Cases
 *
 * This controller demonstrates the domain event system for auditing and replayability:
 * - Query events by tenant, type, aggregate, date range
 * - Event replay for reconstructability
 * - Audit trail across related events (usage -> credit deduction)
 * - Event count summaries
 * - Trigger-and-observe pattern (emit event, then query to verify)
 *
 * Domain events provide an immutable audit log that enables:
 * - Historical reconstruction of system state
 * - Compliance auditing and reporting
 * - Event sourcing patterns
 * - Debugging and troubleshooting
 *
 * Event Types Emitted by Phases 3-6:
 * - usage.recorded (Phase 3)
 * - credit.purchased, credit.granted, credit.deducted, credit.refunded (Phase 4)
 * - entitlement.denied (Phase 4)
 * - subscription.created, subscription.plan_changed, subscription.cancelled, subscription.renewed (Phase 6)
 *
 * Test Tenants (from seed 008):
 * - Tenant 1 (general_counsel): 100 documents/month, 30 contract reviews
 * - Tenant 2 (shield + addon): 25 + 50 = 75 documents/month, 5 contract reviews
 * - Tenant 3 (infrastructure + override): 500 documents (override), unlimited reviews
 *
 * TODO: BullMQ - In production, domain events would be emitted to a queue for:
 * - Async fan-out to multiple listeners (webhooks, notifications, analytics)
 * - Retry logic for failed event handlers
 * - Event replay and reprocessing
 * For now, all event queries are synchronous.
 */
@Controller('mock/domain-events')
@AuthOptions({ tenant: true })
@ApiTags('mock-domain-events')
export class DomainEventsMockController {
  constructor(
    private readonly domainEventsService: DomainEventsService,
    private readonly usageIngestionService: UsageIngestionService,
    private readonly databaseService: DatabaseService,
  ) {}

  // ============================================
  // USE CASE 1: List All Domain Events for Tenant
  // ============================================
  // Returns paginated event stream showing all events emitted by phases 3-6
  // Expected behavior:
  // - Returns events ordered by recorded_at DESC (newest first)
  // - Supports pagination via limit/offset
  // - Shows all event types: usage, credit, subscription, entitlement
  // Demonstrates:
  // - Complete audit trail for a tenant
  // - All domain events are queryable
  // - Pagination support for large event streams
  @Get()
  @ApiOperation({ summary: 'List all domain events for tenant' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of domain events',
  })
  async listAllEvents(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    const events = await this.domainEventsService.getEventsByTenant(
      user.tenantId,
      {
        limit: limitNum,
        offset: offsetNum,
      },
    );

    const total = await this.domainEventsService.countEvents(
      user.tenantId,
      undefined,
    );

    return {
      message: 'Domain events retrieved',
      tenantId: user.tenantId,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + events.length < total,
      },
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        aggregateType: e.aggregate_type,
        aggregateId: e.aggregate_id,
        actorId: e.actor_id,
        actorType: e.actor_type,
        payload: e.payload,
        metadata: e.metadata,
        sequenceNumber: e.sequence_number,
        recordedAt: e.recorded_at,
      })),
      note: 'Events are ordered by recorded_at DESC. Use limit/offset for pagination.',
    };
  }

  // ============================================
  // USE CASE 2: Filter Events by Type
  // ============================================
  // Query events by specific event_type (e.g., 'usage.recorded', 'credit.deducted')
  // Expected behavior:
  // - Returns only events matching the specified type
  // - Ordered by recorded_at DESC
  // Demonstrates:
  // - Event type filtering for focused queries
  // - Useful for debugging specific event types
  // Example event types:
  // - usage.recorded
  // - credit.purchased, credit.deducted
  // - subscription.plan_changed
  // - entitlement.denied
  @Get('by-type/:eventType')
  @ApiOperation({ summary: 'Filter events by event type' })
  @ApiResponse({
    status: 200,
    description: 'Events matching the specified type',
  })
  async filterByType(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('eventType') eventType: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;

    const events = await this.domainEventsService.getEventsByType(
      eventType,
      user.tenantId,
      limitNum,
    );

    return {
      message: `Events filtered by type: ${eventType}`,
      tenantId: user.tenantId,
      eventType,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        aggregateType: e.aggregate_type,
        aggregateId: e.aggregate_id,
        actorId: e.actor_id,
        payload: e.payload,
        recordedAt: e.recorded_at,
      })),
      note: 'Use this to find all events of a specific type (e.g., all credit deductions).',
    };
  }

  // ============================================
  // USE CASE 3: Filter Events by Aggregate
  // ============================================
  // Query full history for a specific aggregate (e.g., all events for a subscription)
  // Expected behavior:
  // - Returns events ordered by sequence_number ASC (chronological order)
  // - Shows complete lifecycle of the aggregate
  // Demonstrates:
  // - Aggregate event history
  // - Sequence numbering for ordering
  // - Event sourcing pattern (reconstruct aggregate state from events)
  @Get('by-aggregate/:aggregateType/:aggregateId')
  @ApiOperation({ summary: 'Get event history for a specific aggregate' })
  @ApiResponse({
    status: 200,
    description: 'Full event history for the aggregate',
  })
  async filterByAggregate(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('aggregateType') aggregateType: string,
    @Param('aggregateId') aggregateId: string,
  ) {
    const events = await this.domainEventsService.getEventsByAggregate(
      aggregateType,
      aggregateId,
      user.tenantId,
    );

    return {
      message: `Event history for ${aggregateType}/${aggregateId}`,
      tenantId: user.tenantId,
      aggregateType,
      aggregateId,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        sequenceNumber: e.sequence_number,
        actorId: e.actor_id,
        payload: e.payload,
        recordedAt: e.recorded_at,
      })),
      note: 'Events are ordered by sequence_number ASC (chronological). Use this to reconstruct aggregate state.',
    };
  }

  // ============================================
  // USE CASE 4: Filter by Date Range
  // ============================================
  // Query events within a date range
  // Expected behavior:
  // - Returns events where recorded_at is between fromDate and toDate
  // - Supports pagination
  // Demonstrates:
  // - Temporal queries for reporting
  // - Useful for generating period-based audit reports
  @Get('range')
  @ApiOperation({ summary: 'Filter events by date range' })
  @ApiResponse({
    status: 200,
    description: 'Events within the specified date range',
  })
  async filterByDateRange(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('limit') limit?: string,
  ) {
    if (!fromDate && !toDate) {
      throw new BadRequestException(
        'At least one of fromDate or toDate is required',
      );
    }

    const limitNum = limit ? parseInt(limit, 10) : 50;

    const events = await this.domainEventsService.getEventsByTenant(
      user.tenantId,
      {
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        limit: limitNum,
      },
    );

    return {
      message: 'Events filtered by date range',
      tenantId: user.tenantId,
      filters: {
        fromDate: fromDate ?? 'none',
        toDate: toDate ?? 'none',
      },
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        aggregateType: e.aggregate_type,
        aggregateId: e.aggregate_id,
        recordedAt: e.recorded_at,
        payload: e.payload,
      })),
      note: 'Use this for period-based audit reports (e.g., all events in January 2026).',
    };
  }

  // ============================================
  // USE CASE 5: Replay Events
  // ============================================
  // Returns all events for a tenant in chronological order for event replay
  // Expected behavior:
  // - Returns events ordered by sequence_number and recorded_at ASC
  // - Optionally start from a specific date
  // - Large limit (1000) for full replay
  // Demonstrates:
  // - Event sourcing: reconstruct system state from events
  // - Replayability: events can be replayed to rebuild projections
  // - Historical reconstruction: rebuild state as it was at any point in time
  @Get('replay')
  @ApiOperation({ summary: 'Replay all tenant events in chronological order' })
  @ApiResponse({
    status: 200,
    description: 'Ordered events for replay',
  })
  async replayEvents(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Query('fromDate') fromDate?: string,
  ) {
    const events = await this.domainEventsService.replayEvents(
      user.tenantId,
      fromDate ? new Date(fromDate) : undefined,
    );

    return {
      message: 'Events ready for replay',
      tenantId: user.tenantId,
      fromDate: fromDate ?? 'beginning',
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        aggregateType: e.aggregate_type,
        aggregateId: e.aggregate_id,
        sequenceNumber: e.sequence_number,
        actorId: e.actor_id,
        payload: e.payload,
        recordedAt: e.recorded_at,
      })),
      note: 'Events are ordered for replay. Process them in order to reconstruct system state.',
    };
  }

  // ============================================
  // USE CASE 6: Audit Trail for a Usage Event
  // ============================================
  // Given a usage event ID, show the complete audit trail including related credit deductions
  // Expected behavior:
  // - Returns the usage.recorded event
  // - If credits were deducted, returns the credit.deducted event
  // - Shows the linkage via usage_ledger_id
  // Demonstrates:
  // - Cross-aggregate audit trail
  // - Event correlation and causality
  // - Complete audit chain for a single operation
  @Post('audit-trail')
  @ApiOperation({
    summary: 'Get audit trail for a usage event (usage + credit deduction)',
  })
  @ApiResponse({
    status: 200,
    description: 'Complete audit trail for the usage event',
  })
  async getAuditTrail(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body('usageEventId') usageEventId: string,
  ) {
    if (!usageEventId) {
      throw new BadRequestException('usageEventId is required');
    }

    const trail = await this.domainEventsService.getAuditTrail(
      user.tenantId,
      'usage',
      usageEventId,
    );

    return {
      message: 'Audit trail retrieved',
      tenantId: user.tenantId,
      usageEventId,
      trailLength: trail.length,
      trail: trail.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        aggregateType: e.aggregate_type,
        aggregateId: e.aggregate_id,
        actorId: e.actor_id,
        payload: e.payload,
        recordedAt: e.recorded_at,
      })),
      note: 'Audit trail shows the usage event and any related credit deductions. Events are ordered chronologically.',
    };
  }

  // ============================================
  // USE CASE 7: Trigger and Observe
  // ============================================
  // Records a usage event, then immediately queries domain_events to show it was emitted
  // Expected behavior:
  // 1. Records usage via UsageIngestionService
  // 2. usage.recorded domain event is emitted
  // 3. Query domain_events to find the event
  // 4. Return both the usage event and the domain event
  // Demonstrates:
  // - End-to-end flow: service call -> event emission -> queryability
  // - Domain events are synchronously written (for now)
  // - Event payload contains full context
  @Post('trigger-and-observe')
  @ApiOperation({
    summary: 'Record usage and observe the emitted domain event',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage recorded and domain event observed',
  })
  async triggerAndObserve(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        // Step 1: Record a usage event
        const usageEvent = await this.usageIngestionService.recordUsage(
          {
            tenant_id: user.tenantId,
            feature_key: 'documents_per_month',
            user_id: user.userId,
            units: 1,
            allocations: [{ source: 'plan', units: 1 }],
            metadata: {
              test_scenario: 'trigger_and_observe',
            },
          },
          { client },
        );

        // Step 2: Query domain_events to find the emitted event
        const domainEvents = await this.domainEventsService.getEventsByTenant(
          user.tenantId,
          {
            eventType: 'usage.recorded',
            limit: 10,
          },
          { client },
        );

        // Find the event that matches our usage event
        const matchingEvent = domainEvents.find((e) => {
          const payload = e.payload as any;
          return payload.usage_event_id === usageEvent.id;
        });

        return {
          message: 'Usage recorded and domain event observed',
          tenantId: user.tenantId,
          usageEvent: {
            id: usageEvent.id,
            featureId: usageEvent.feature_id,
            units: usageEvent.units,
            allocations: [{ source: 'plan', units: 1 }],
            billingPeriod: usageEvent.billing_period,
            recordedAt: usageEvent.recorded_at,
          },
          domainEvent: matchingEvent
            ? {
                id: matchingEvent.id,
                eventType: matchingEvent.event_type,
                aggregateType: matchingEvent.aggregate_type,
                aggregateId: matchingEvent.aggregate_id,
                payload: matchingEvent.payload,
                recordedAt: matchingEvent.recorded_at,
              }
            : null,
          note: 'The domain event was emitted synchronously when usage was recorded. In production with BullMQ, this would be async.',
        };
      },
    );
  }

  // ============================================
  // USE CASE 8: Event Counts Summary
  // ============================================
  // Returns count of events grouped by event_type for the tenant
  // Expected behavior:
  // - Returns summary: { event_type: 'usage.recorded', count: 42 }
  // - Ordered by count DESC (most frequent first)
  // Demonstrates:
  // - Event analytics and monitoring
  // - Quick overview of tenant activity
  // - Useful for dashboards and reporting
  @Get('summary')
  @ApiOperation({ summary: 'Get event counts grouped by type' })
  @ApiResponse({
    status: 200,
    description: 'Event count summary by type',
  })
  async getEventSummary(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const summary = await this.domainEventsService.getEventSummary(
      user.tenantId,
    );

    const total = summary.reduce((sum, s) => sum + s.count, 0);

    return {
      message: 'Event summary retrieved',
      tenantId: user.tenantId,
      totalEvents: total,
      summary: summary.map((s) => ({
        eventType: s.event_type,
        count: s.count,
        percentage: ((s.count / total) * 100).toFixed(1) + '%',
      })),
      note: 'Summary shows event counts grouped by type. Use this for monitoring tenant activity.',
    };
  }

  // ============================================
  // USE CASE 9: Filter by Aggregate Type
  // ============================================
  // Query events by aggregate_type (e.g., all 'usage' events, all 'credit' events)
  // Expected behavior:
  // - Returns events where aggregate_type matches
  // - Ordered by recorded_at DESC
  // Demonstrates:
  // - Aggregate-level filtering
  // - Useful for domain-specific queries
  @Get('by-aggregate-type/:aggregateType')
  @ApiOperation({ summary: 'Filter events by aggregate type' })
  @ApiResponse({
    status: 200,
    description: 'Events for the specified aggregate type',
  })
  async filterByAggregateType(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('aggregateType') aggregateType: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;

    const events = await this.domainEventsService.getEventsByTenant(
      user.tenantId,
      {
        aggregateType,
        limit: limitNum,
      },
    );

    return {
      message: `Events filtered by aggregate type: ${aggregateType}`,
      tenantId: user.tenantId,
      aggregateType,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        aggregateId: e.aggregate_id,
        sequenceNumber: e.sequence_number,
        payload: e.payload,
        recordedAt: e.recorded_at,
      })),
      note: 'Use this to see all events for a domain (e.g., all usage events, all credit events).',
    };
  }

  // ============================================
  // USE CASE 10: Combined Filters
  // ============================================
  // Demonstrates combining multiple filters (type + date range)
  // Expected behavior:
  // - Returns events matching ALL specified filters
  // - Supports pagination
  // Demonstrates:
  // - Complex filtering for precise queries
  // - Useful for compliance reporting (e.g., "all credit deductions in Q1 2026")
  @Get('advanced-filter')
  @ApiOperation({ summary: 'Filter events with multiple criteria' })
  @ApiResponse({
    status: 200,
    description: 'Events matching all filters',
  })
  async advancedFilter(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Query('eventType') eventType?: string,
    @Query('aggregateType') aggregateType?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    const events = await this.domainEventsService.getEventsByTenant(
      user.tenantId,
      {
        eventType,
        aggregateType,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        limit: limitNum,
        offset: offsetNum,
      },
    );

    const total = await this.domainEventsService.countEvents(user.tenantId, {
      eventType,
      aggregateType,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    });

    return {
      message: 'Events filtered with multiple criteria',
      tenantId: user.tenantId,
      filters: {
        eventType: eventType ?? 'none',
        aggregateType: aggregateType ?? 'none',
        fromDate: fromDate ?? 'none',
        toDate: toDate ?? 'none',
      },
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + events.length < total,
      },
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        aggregateType: e.aggregate_type,
        aggregateId: e.aggregate_id,
        recordedAt: e.recorded_at,
        payload: e.payload,
      })),
      note: 'Combine filters for precise queries (e.g., "all usage events in January 2026").',
    };
  }

  // ============================================
  // USE CASE 11: Latest Event by Aggregate
  // ============================================
  // Get the most recent event for a specific aggregate
  // Expected behavior:
  // - Returns the event with highest sequence_number for the aggregate
  // - Useful for getting current state of an aggregate
  // Demonstrates:
  // - Latest event lookup
  // - Useful for "what was the last thing that happened to X?"
  @Get('latest/:aggregateType/:aggregateId')
  @ApiOperation({ summary: 'Get latest event for an aggregate' })
  @ApiResponse({
    status: 200,
    description: 'Most recent event for the aggregate',
  })
  async getLatestEvent(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('aggregateType') aggregateType: string,
    @Param('aggregateId') aggregateId: string,
  ) {
    return this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId },
      async (client) => {
        const event = await this.domainEventsService.getEventsByAggregate(
          aggregateType,
          aggregateId,
          undefined,
          { client },
        );

        const latestEvent = event.length > 0 ? event[event.length - 1] : null;

        return {
          message: latestEvent
            ? 'Latest event retrieved'
            : 'No events found for aggregate',
          tenantId: user.tenantId,
          aggregateType,
          aggregateId,
          latestEvent: latestEvent
            ? {
                id: latestEvent.id,
                eventType: latestEvent.event_type,
                sequenceNumber: latestEvent.sequence_number,
                actorId: latestEvent.actor_id,
                payload: latestEvent.payload,
                recordedAt: latestEvent.recorded_at,
              }
            : null,
          note: 'Returns the most recent event for this aggregate. Useful for checking current state.',
        };
      },
    );
  }

  // ============================================
  // USE CASE 12: Event Immutability Test
  // ============================================
  // Demonstrates that domain events cannot be updated or deleted
  // Expected behavior:
  // - Attempting to update or delete throws an error
  // - Events are truly immutable
  // Demonstrates:
  // - Append-only guarantee
  // - Audit trail integrity
  @Get('immutability-test')
  @ApiOperation({ summary: 'Verify domain events are immutable' })
  @ApiResponse({
    status: 200,
    description: 'Immutability verification result',
  })
  async testImmutability(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    const events = await this.domainEventsService.getEventsByTenant(
      user.tenantId,
      { limit: 1 },
    );

    if (events.length === 0) {
      return {
        message: 'No events found to test immutability',
        tenantId: user.tenantId,
        note: 'Record some usage or credits first, then try this endpoint.',
      };
    }

    const testEvent = events[0];

    // Try to update (should fail)
    let updateError: string | null = null;
    try {
      await this.databaseService.query(
        'UPDATE public.domain_events SET event_type = $1 WHERE id = $2',
        ['modified', testEvent.id],
      );
    } catch (error) {
      updateError = error.message;
    }

    // Try to delete (should fail)
    let deleteError: string | null = null;
    try {
      await this.databaseService.query(
        'DELETE FROM public.domain_events WHERE id = $1',
        [testEvent.id],
      );
    } catch (error) {
      deleteError = error.message;
    }

    return {
      message: 'Immutability test complete',
      tenantId: user.tenantId,
      testedEventId: testEvent.id,
      results: {
        updateAttempt: updateError
          ? 'Blocked (as expected)'
          : 'Allowed (UNEXPECTED - should be blocked)',
        updateError,
        deleteAttempt: deleteError
          ? 'Blocked (as expected)'
          : 'Allowed (UNEXPECTED - should be blocked)',
        deleteError,
      },
      note: 'Domain events are protected by database RULES. UPDATE and DELETE operations should fail.',
    };
  }
}
