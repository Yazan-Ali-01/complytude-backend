import { BaseRepository, DatabaseService } from '@lib/database';
import { Injectable, Logger } from '@nestjs/common';
import type { QueryResult } from 'pg';
import { AuditLog, AuditLogFilters, CreateAuditLogInput } from './audit.types';

const SELECT_COLUMNS =
  'id, tenant_id, actor_id, actor_type, user_role, action, resource_type, resource_id, details, ai_model_used, ip_address, user_agent, trace_id, created_at';

@Injectable()
export class AuditLogsRepository extends BaseRepository<
  AuditLog,
  CreateAuditLogInput,
  never
> {
  private readonly auditLogger = new Logger(AuditLogsRepository.name);

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'audit_logs');
  }

  protected mapRow(row: Record<string, unknown>): AuditLog {
    return {
      id: row.id as string,
      tenantId: (row.tenant_id as string) || null,
      actorId: (row.actor_id as string) || null,
      actorType: (row.actor_type as AuditLog['actorType']) || 'user',
      userRole: (row.user_role as string) || null,
      action: row.action as string,
      resourceType: row.resource_type as string,
      resourceId: (row.resource_id as string) || null,
      details: (row.details as Record<string, unknown>) || {},
      aiModelUsed: (row.ai_model_used as string) || null,
      ipAddress: (row.ip_address as string) || null,
      userAgent: (row.user_agent as string) || null,
      traceId: (row.trace_id as string) || null,
      createdAt: row.created_at as Date,
    };
  }

  protected getSelectColumns(): string {
    return SELECT_COLUMNS;
  }

  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const query = `
      INSERT INTO ${this.tableName} (
        tenant_id, actor_id, actor_type, user_role, action, resource_type, resource_id,
        details, ai_model_used, ip_address, user_agent, trace_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING ${SELECT_COLUMNS}
    `;

    const result = await this.inRowContext(input.tenantId, query, [
      input.tenantId || null,
      input.actorId || null,
      input.actorType || 'user',
      input.userRole || null,
      input.action,
      input.resourceType,
      input.resourceId || null,
      JSON.stringify(input.details || {}),
      input.aiModelUsed || null,
      input.ipAddress || null,
      input.userAgent || null,
      input.traceId || null,
    ]);

    return this.mapRow(result.rows[0]);
  }

  async createBatch(inputs: CreateAuditLogInput[]): Promise<AuditLog[]> {
    if (inputs.length === 0) return [];

    // One insert per tenant: each runs in that tenant's context (RLS)
    const byTenant = new Map<string | null, CreateAuditLogInput[]>();
    for (const input of inputs) {
      const key = input.tenantId || null;
      byTenant.set(key, [...(byTenant.get(key) ?? []), input]);
    }
    const results: AuditLog[] = [];
    for (const [tenantId, group] of byTenant) {
      results.push(...(await this.insertGroup(tenantId, group)));
    }
    return results;
  }

  private async insertGroup(
    tenantId: string | null,
    inputs: CreateAuditLogInput[],
  ): Promise<AuditLog[]> {
    const COLS_PER_ROW = 12;
    const valuePlaceholders = inputs
      .map((_, rowIdx) => {
        const base = rowIdx * COLS_PER_ROW;
        const placeholders = Array.from(
          { length: COLS_PER_ROW },
          (_, colIdx) => `$${base + colIdx + 1}`,
        ).join(', ');
        return `(${placeholders})`;
      })
      .join(',\n  ');

    const params = inputs.flatMap((input) => [
      input.tenantId || null,
      input.actorId || null,
      input.actorType || 'user',
      input.userRole || null,
      input.action,
      input.resourceType,
      input.resourceId || null,
      JSON.stringify(input.details || {}),
      input.aiModelUsed || null,
      input.ipAddress || null,
      input.userAgent || null,
      input.traceId || null,
    ]);

    const query = `
      INSERT INTO ${this.tableName} (
        tenant_id, actor_id, actor_type, user_role, action, resource_type, resource_id,
        details, ai_model_used, ip_address, user_agent, trace_id
      )
      VALUES
        ${valuePlaceholders}
      RETURNING ${SELECT_COLUMNS}
    `;

    try {
      const result = await this.inRowContext(tenantId, query, params);
      return result.rows.map((row) => this.mapRow(row));
    } catch (batchError) {
      this.auditLogger.error(
        `Batch audit insert failed, falling back to row-by-row: ${batchError instanceof Error ? batchError.message : String(batchError)}`,
        batchError instanceof Error ? batchError.stack : undefined,
      );

      const results: AuditLog[] = [];
      for (const input of inputs) {
        try {
          const row = await this.create(input);
          results.push(row);
        } catch (rowError) {
          this.auditLogger.error(
            `Failed to insert audit log row: ${rowError instanceof Error ? rowError.message : String(rowError)}`,
            rowError instanceof Error ? rowError.stack : undefined,
          );
        }
      }
      return results;
    }
  }

  /**
   * audit_logs has RLS: a row is written and read in its own tenant's context, and a row with no
   * tenant (system or identity-level events) in platform-admin context.
   */
  private inRowContext(
    tenantId: string | null | undefined,
    query: string,
    params: unknown[],
  ): Promise<QueryResult<Record<string, unknown>>> {
    return tenantId
      ? this.executeQuery<Record<string, unknown>>(query, params, {
          tenant: { tenantId, schema: 'public' },
        })
      : this.databaseService.transactionWithPlatformAdminContext((client) =>
          this.executeQuery<Record<string, unknown>>(query, params, {
            client,
          }),
        );
  }

  async findByTenant(
    tenantId: string,
    filters?: AuditLogFilters,
  ): Promise<AuditLog[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }
    if (filters?.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }
    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }
    if (filters?.actorType) {
      conditions.push(`actor_type = $${paramIndex++}`);
      params.push(filters.actorType);
    }
    if (filters?.traceId) {
      conditions.push(`trace_id = $${paramIndex++}`);
      params.push(filters.traceId);
    }

    const query = `
      SELECT ${SELECT_COLUMNS}
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${filters?.limit || 100}
      OFFSET ${filters?.offset || 0}
    `;

    const result = await this.executeQuery(query, params, {
      tenant: { tenantId, schema: 'public' },
    });
    return result.rows.map((row) => this.mapRow(row));
  }

  async findByActor(
    actorId: string,
    filters?: AuditLogFilters,
  ): Promise<AuditLog[]> {
    const conditions: string[] = ['actor_id = $1'];
    const params: unknown[] = [actorId];
    let paramIndex = 2;

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }
    if (filters?.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }
    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }
    if (filters?.actorType) {
      conditions.push(`actor_type = $${paramIndex++}`);
      params.push(filters.actorType);
    }
    if (filters?.traceId) {
      conditions.push(`trace_id = $${paramIndex++}`);
      params.push(filters.traceId);
    }

    const query = `
      SELECT ${SELECT_COLUMNS}
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${filters?.limit || 100}
      OFFSET ${filters?.offset || 0}
    `;

    // An actor's history spans tenants: platform admins only
    const result = await this.inRowContext(null, query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  async countByTenant(
    tenantId: string,
    filters?: Omit<AuditLogFilters, 'limit' | 'offset'>,
  ): Promise<number> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }
    if (filters?.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }
    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }
    if (filters?.actorType) {
      conditions.push(`actor_type = $${paramIndex++}`);
      params.push(filters.actorType);
    }
    if (filters?.traceId) {
      conditions.push(`trace_id = $${paramIndex++}`);
      params.push(filters.traceId);
    }

    const query = `
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
    `;

    const result = await this.executeQuery(query, params, {
      tenant: { tenantId, schema: 'public' },
    });
    return parseInt((result.rows[0]?.count as string) || '0', 10);
  }
}
