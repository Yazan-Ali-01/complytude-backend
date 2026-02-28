import { BaseRepository, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  CreateDomainEventRow,
  DomainEvent,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';

type DomainEventRow = {
  id: string;
  tenant_id: string | null;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_id: string | null;
  actor_type: string;
  payload: unknown;
  metadata: unknown;
  sequence_number: number | null;
  recorded_at: Date;
};

/**
 * Repository for managing Domain Event entities (append-only).
 * Immutable event store for auditing and replayability.
 *
 * Note: This is a stub for Phase 7. No UPDATE or DELETE methods.
 *
 * IMPORTANT - Feature Snapshotting for Auditing:
 * When emitting usage events, the payload MUST include feature snapshots:
 * - feature_id: UUID (for relational integrity)
 * - feature_key: string (snapshot at time of event)
 * - feature_name: string (snapshot at time of event)
 *
 * This ensures historical audit trails remain accurate even if features
 * are renamed or their keys change. The snapshot preserves what the feature
 * was called at the time of the event.
 *
 * Example payload:
 * {
 *   feature_id: 'uuid-here',
 *   feature_key: 'documents_per_month',
 *   feature_name: 'Documents Per Month',
 *   units: 1,
 *   source: 'plan',
 *   // ... other usage data
 * }
 */
@Injectable()
export class DomainEventsRepository extends BaseRepository<
  DomainEvent,
  CreateDomainEventRow,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.domain_events');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, event_type, aggregate_type, aggregate_id, actor_id, actor_type, payload, metadata, sequence_number, recorded_at';
  }

  protected mapRow(row: Record<string, unknown>): DomainEvent {
    const data = row as DomainEventRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id ?? undefined,
      event_type: data.event_type,
      aggregate_type: data.aggregate_type,
      aggregate_id: data.aggregate_id,
      actor_id: data.actor_id ?? undefined,
      actor_type: data.actor_type,
      payload: (data.payload as Record<string, any>) ?? {},
      metadata: (data.metadata as Record<string, any>) ?? {},
      sequence_number: data.sequence_number ?? undefined,
      recorded_at: data.recorded_at,
    };
  }

  /**
   * Emit domain event (append-only)
   * Phase 7 implementation
   */
  async emit(
    event: CreateDomainEventRow,
    options?: QueryOptions,
  ): Promise<DomainEvent> {
    return this.create(event, options);
  }

  /**
   * Find events by aggregate
   * Phase 7 implementation
   */
  async findByAggregate(
    aggregateType: string,
    aggregateId: string,
    options?: QueryOptions,
  ): Promise<DomainEvent[]> {
    const result = await this.executeQuery<DomainEventRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE aggregate_type = $1 AND aggregate_id = $2
       ORDER BY sequence_number ASC NULLS LAST, recorded_at ASC`,
      [aggregateType, aggregateId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find events by tenant with optional filters
   * Phase 7 implementation
   */
  async findByTenant(
    tenantId: string,
    filters?: {
      eventType?: string;
      aggregateType?: string;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    },
    options?: QueryOptions,
  ): Promise<DomainEvent[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    // Build WHERE clause dynamically based on filters
    if (filters?.eventType) {
      conditions.push(`event_type = $${paramIndex}`);
      params.push(filters.eventType);
      paramIndex++;
    }

    if (filters?.aggregateType) {
      conditions.push(`aggregate_type = $${paramIndex}`);
      params.push(filters.aggregateType);
      paramIndex++;
    }

    if (filters?.fromDate) {
      conditions.push(`recorded_at >= $${paramIndex}`);
      params.push(filters.fromDate);
      paramIndex++;
    }

    if (filters?.toDate) {
      conditions.push(`recorded_at <= $${paramIndex}`);
      params.push(filters.toDate);
      paramIndex++;
    }

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY recorded_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await this.executeQuery<DomainEventRow>(
      query,
      params,
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find events by event type
   * Phase 7 implementation
   */
  async findByEventType(
    eventType: string,
    tenantId?: string,
    limit: number = 50,
    options?: QueryOptions,
  ): Promise<DomainEvent[]> {
    const conditions: string[] = ['event_type = $1'];
    const params: any[] = [eventType];

    if (tenantId) {
      conditions.push('tenant_id = $2');
      params.push(tenantId);
      params.push(limit);
    } else {
      params.push(limit);
    }

    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY recorded_at DESC
      LIMIT $${params.length}
    `;

    const result = await this.executeQuery<DomainEventRow>(
      query,
      params,
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Count events by tenant with optional filters
   * Phase 7 implementation
   */
  async countByTenant(
    tenantId: string,
    filters?: {
      eventType?: string;
      aggregateType?: string;
      fromDate?: Date;
      toDate?: Date;
    },
    options?: QueryOptions,
  ): Promise<number> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.eventType) {
      conditions.push(`event_type = $${paramIndex}`);
      params.push(filters.eventType);
      paramIndex++;
    }

    if (filters?.aggregateType) {
      conditions.push(`aggregate_type = $${paramIndex}`);
      params.push(filters.aggregateType);
      paramIndex++;
    }

    if (filters?.fromDate) {
      conditions.push(`recorded_at >= $${paramIndex}`);
      params.push(filters.fromDate);
      paramIndex++;
    }

    if (filters?.toDate) {
      conditions.push(`recorded_at <= $${paramIndex}`);
      params.push(filters.toDate);
      paramIndex++;
    }

    const query = `
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
    `;

    const result = await this.executeQuery<{ count: string }>(
      query,
      params,
      options,
    );

    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Get latest event by aggregate
   * Phase 7 implementation
   */
  async getLatestByAggregate(
    aggregateType: string,
    aggregateId: string,
    options?: QueryOptions,
  ): Promise<DomainEvent | null> {
    const result = await this.executeQuery<DomainEventRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE aggregate_type = $1 AND aggregate_id = $2
       ORDER BY sequence_number DESC NULLS LAST, recorded_at DESC
       LIMIT 1`,
      [aggregateType, aggregateId],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get event counts grouped by event_type for a tenant
   * Phase 7 implementation
   */
  async getEventSummary(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<Array<{ event_type: string; count: number }>> {
    const result = await this.executeQuery<{
      event_type: string;
      count: string;
    }>(
      `SELECT event_type, COUNT(*) as count
       FROM ${this.tableName}
       WHERE tenant_id = $1
       GROUP BY event_type
       ORDER BY count DESC`,
      [tenantId],
      options,
    );

    return result.rows.map((row) => ({
      event_type: row.event_type,
      count: parseInt(row.count, 10),
    }));
  }

  // Override update/delete to prevent usage (immutable event store)
  update(): Promise<never> {
    throw new Error(
      'Domain events are immutable. UPDATE operations are not allowed.',
    );
  }

  delete(): Promise<never> {
    throw new Error(
      'Domain events are immutable. DELETE operations are not allowed.',
    );
  }
}
