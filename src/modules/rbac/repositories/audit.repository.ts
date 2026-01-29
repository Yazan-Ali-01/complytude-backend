import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import {
  AuditLog,
  CreateAuditLogRow,
  AuditLogQueryOptions,
} from '../entities/audit-log.entity';

@Injectable()
export class AuditRepository {
  private readonly logger = new Logger(AuditRepository.name);
  private readonly tableName = 'public.audit_logs';

  constructor(private readonly databaseService: DatabaseService) {}

  private mapRow(row: Record<string, unknown>): AuditLog {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      tenant_id: row.tenant_id as string,
      role_name: row.role_name as string,
      action: row.action as string,
      resource_type: row.resource_type as string,
      resource_id: row.resource_id as string | null,
      metadata: (row.metadata as Record<string, unknown>) || {},
      ai_model_used: row.ai_model_used as string | null,
      ip_address: row.ip_address as string | null,
      user_agent: row.user_agent as string | null,
      created_at: new Date(row.created_at as string),
    };
  }

  async log(entry: CreateAuditLogRow): Promise<AuditLog> {
    this.logger.debug(`log: table=${this.tableName}, action=${entry.action}`);
    const {
      user_id,
      tenant_id,
      role_name,
      action,
      resource_type,
      resource_id,
      metadata,
      ai_model_used,
      ip_address,
      user_agent,
    } = entry;

    const result = await this.databaseService.query(
      `INSERT INTO ${this.tableName}
       (user_id, tenant_id, role_name, action, resource_type, resource_id, metadata, ai_model_used, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        user_id,
        tenant_id,
        role_name,
        action,
        resource_type,
        resource_id,
        JSON.stringify(metadata),
        ai_model_used,
        ip_address,
        user_agent,
      ],
      true,
    );
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<AuditLog | null> {
    this.logger.debug(`findById: table=${this.tableName}, id=${id}`);
    const result = await this.databaseService.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id],
      true,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByTenant(options: AuditLogQueryOptions): Promise<AuditLog[]> {
    this.logger.debug(
      `findByTenant: table=${this.tableName}, tenantId=${options.tenantId}`,
    );
    const {
      tenantId,
      startDate,
      endDate,
      action,
      userId,
      limit = 100,
      offset = 0,
    } = options;

    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    params.push(limit, offset);

    const result = await this.databaseService.query(
      `SELECT * FROM ${this.tableName}
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params,
      true,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findByUser(userId: string, tenantId: string): Promise<AuditLog[]> {
    this.logger.debug(
      `findByUser: table=${this.tableName}, userId=${userId}, tenantId=${tenantId}`,
    );
    const result = await this.databaseService.query(
      `SELECT * FROM ${this.tableName}
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId, tenantId],
      true,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async countByTenant(options: AuditLogQueryOptions): Promise<number> {
    this.logger.debug(
      `countByTenant: table=${this.tableName}, tenantId=${options.tenantId}`,
    );
    const { tenantId, startDate, endDate, action, userId } = options;

    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    const result = await this.databaseService.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`,
      params,
      true,
    );
    return parseInt(result.rows[0]?.count as string, 10);
  }

  async deleteOldLogs(beforeDate: Date): Promise<number> {
    this.logger.debug(
      `deleteOldLogs: table=${this.tableName}, before=${beforeDate.toISOString()}`,
    );
    const result = await this.databaseService.query(
      `DELETE FROM ${this.tableName} WHERE created_at < $1`,
      [beforeDate],
      true,
    );
    return result.rowCount ?? 0;
  }
}
