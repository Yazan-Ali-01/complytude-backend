import { Injectable } from '@nestjs/common';
import {
  CreateCreditLedgerRow,
  CreditLedgerTransaction,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';

type CreditLedgerRow = {
  id: string;
  tenant_id: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  feature_id: string | null;
  usage_ledger_id: string | null;
  reason: string | null;
  applied_by: string | null;
  expires_at: Date | null;
  metadata: unknown;
  idempotency_key: string | null;
  recorded_at: Date;
};

/**
 * Repository for managing Credit Ledger transactions (append-only).
 * Source of truth for credit tracking.
 *
 * Note: This is a stub for Phase 4. No UPDATE or DELETE methods.
 */
@Injectable()
export class CreditLedgerRepository extends BaseRepository<
  CreditLedgerTransaction,
  CreateCreditLedgerRow,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.credit_ledger');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, transaction_type, amount, balance_after, feature_id, usage_ledger_id, reason, applied_by, expires_at, metadata, idempotency_key, recorded_at';
  }

  protected mapRow(row: Record<string, unknown>): CreditLedgerTransaction {
    const data = row as CreditLedgerRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      transaction_type:
        data.transaction_type as CreditLedgerTransaction['transaction_type'],
      amount: data.amount,
      balance_after: data.balance_after,
      feature_id: data.feature_id ?? undefined,
      usage_ledger_id: data.usage_ledger_id ?? undefined,
      reason: data.reason ?? undefined,
      applied_by: data.applied_by ?? undefined,
      expires_at: data.expires_at ?? undefined,
      metadata: (data.metadata as Record<string, any>) ?? {},
      idempotency_key: data.idempotency_key ?? undefined,
      recorded_at: data.recorded_at,
    };
  }

  /**
   * Record credit transaction (append-only)
   * Phase 4 implementation
   */
  async record(
    transaction: CreateCreditLedgerRow,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    return this.create(transaction, options);
  }

  /**
   * Get current credit balance for a tenant
   * Phase 4 implementation
   */
  async getBalance(tenantId: string, options?: QueryOptions): Promise<number> {
    const result = await this.executeQuery<{ balance: string | number }>(
      `SELECT COALESCE(SUM(amount), 0) as balance
       FROM ${this.tableName}
       WHERE tenant_id = $1
       AND (expires_at IS NULL OR expires_at > now())`,
      [tenantId],
      options,
    );

    // PostgreSQL returns numeric types as strings to preserve precision
    // Convert to number for JavaScript arithmetic operations
    const balance = result.rows[0]?.balance ?? 0;
    return typeof balance === 'string' ? parseFloat(balance) : balance;
  }

  /**
   * Get balance breakdown by transaction type
   * Phase 4 implementation
   */
  async getBalanceBreakdown(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<Record<string, number>> {
    const result = await this.executeQuery<{
      transaction_type: string;
      total: number;
    }>(
      `SELECT transaction_type, COALESCE(SUM(amount), 0) as total
       FROM ${this.tableName}
       WHERE tenant_id = $1
       AND (expires_at IS NULL OR expires_at > now())
       GROUP BY transaction_type`,
      [tenantId],
      options,
    );

    const breakdown: Record<string, number> = {
      purchase: 0,
      grant: 0,
      deduction: 0,
      refund: 0,
      expiry: 0,
    };

    for (const row of result.rows) {
      breakdown[row.transaction_type] =
        typeof row.total === 'string' ? parseFloat(row.total) : row.total;
    }

    return breakdown;
  }

  /**
   * Get transaction history with pagination
   * Phase 4 implementation
   */
  async getTransactionHistory(
    tenantId: string,
    limit: number = 50,
    cursor?: string,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction[]> {
    let query = `SELECT ${this.getSelectColumns()}
                 FROM ${this.tableName}
                 WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (cursor) {
      query += ` AND recorded_at < $2`;
      params.push(cursor);
    }

    query += ` ORDER BY recorded_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.executeQuery(query, params, options);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find transaction by idempotency key
   * Phase 4 implementation
   *
   * @param tenantId - Tenant ID (required for defense-in-depth)
   * @param idempotencyKey - Idempotency key to search for
   * @param options - Query options
   * @returns Credit transaction or null if not found
   */
  async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction | null> {
    const result = await this.executeQuery(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.tableName}
       WHERE tenant_id = $1
         AND idempotency_key = $2
       LIMIT 1`,
      [tenantId, idempotencyKey],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  // Override update/delete to prevent usage (immutable ledger)
  update(): Promise<never> {
    throw new Error(
      'Credit ledger is immutable. UPDATE operations are not allowed.',
    );
  }

  delete(): Promise<never> {
    throw new Error(
      'Credit ledger is immutable. DELETE operations are not allowed.',
    );
  }
}
