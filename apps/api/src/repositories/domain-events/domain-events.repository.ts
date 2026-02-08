import { Injectable } from '@nestjs/common';
import {
  CreateDomainEventRow,
  DomainEvent,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';

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
       ORDER BY sequence_number ASC, recorded_at ASC`,
      [aggregateType, aggregateId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
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
