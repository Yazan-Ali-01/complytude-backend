import { DatabaseService, QueryOptions } from '@lib/database';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  CreditDeductInput,
  CreditGrantInput,
  CreditLedgerTransaction,
  CreditPurchaseInput,
  CreditRefundInput,
  CreditTransactionType,
  RecordTransactionInput,
} from '../../../common/types/entitlement.types';
import { CreditLedgerRepository } from '../../../repositories/credits/credit-ledger.repository';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { DomainEventsService } from './domain-events.service';

/**
 * Credit Ledger Service
 *
 * Core service for managing credit transactions (append-only ledger).
 *
 * Key responsibilities:
 * - Record credit purchases, grants, deductions, refunds
 * - Compute running balance (balance_after column)
 * - Emit domain events for audit trail
 * - Provide transaction history queries
 *
 * Architecture:
 * - All mutations are append-only writes to credit_ledger
 * - balance_after is computed within the same transaction
 * - Domain events provide audit trail and enable event sourcing
 *
 * TODO: BullMQ - Credit operations should emit events to queue for:
 * - Async notification processing (email alerts when balance is low)
 * - Webhook notifications to external systems
 * - Analytics and reporting
 */
@Injectable()
export class CreditLedgerService {
  private readonly logger = new Logger(CreditLedgerService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly creditLedgerRepository: CreditLedgerRepository,
    private readonly featuresRepository: FeaturesRepository,
    private readonly domainEventsService: DomainEventsService,
  ) {}

  async purchase(
    input: CreditPurchaseInput,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const { tenantId, amount, metadata } = input;
    if (amount <= 0) {
      throw new BadRequestException('Purchase amount must be greater than 0');
    }

    this.logger.debug(
      `Purchasing credits: tenant=${tenantId}, amount=${amount}`,
    );

    return this.recordTransaction(
      {
        tenantId,
        transactionType: 'purchase',
        amount,
        metadata,
      },
      options,
    );

    // TODO: BullMQ - Emit credit.purchased event to queue for async notification
  }

  async grant(
    input: CreditGrantInput,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const { tenantId, amount, reason, expiresAt, appliedBy, metadata } = input;
    if (amount <= 0) {
      throw new BadRequestException('Grant amount must be greater than 0');
    }

    this.logger.debug(
      `Granting credits: tenant=${tenantId}, amount=${amount}, reason=${reason}`,
    );

    return this.recordTransaction(
      {
        tenantId,
        transactionType: 'grant',
        amount,
        reason,
        appliedBy,
        expiresAt,
        metadata,
      },
      options,
    );

    // TODO: BullMQ - Emit credit.granted event to queue for async notification
  }

  async deduct(
    input: CreditDeductInput,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const { tenantId, amount, featureId, usageLedgerId, metadata } = input;
    if (amount <= 0) {
      throw new BadRequestException('Deduction amount must be greater than 0');
    }

    this.logger.debug(
      `Deducting credits: tenant=${tenantId}, amount=${amount}, metadata=${JSON.stringify(metadata)}`,
    );

    return this.recordTransaction(
      {
        tenantId,
        transactionType: 'deduction',
        amount: -amount,
        featureId,
        usageLedgerId,
        metadata,
      },
      options,
    );

    // TODO: BullMQ - Emit credit.deducted event to queue for async notification
    // (email alert when balance is low)
  }

  async refund(
    input: CreditRefundInput,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const { tenantId, amount, reason, metadata } = input;
    if (amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than 0');
    }

    this.logger.debug(
      `Refunding credits: tenant=${tenantId}, amount=${amount}`,
    );

    return this.recordTransaction(
      {
        tenantId,
        transactionType: 'refund',
        amount,
        reason,
        metadata,
      },
      options,
    );
  }

  /**
   * Get current credit balance
   *
   * Delegates to repository.
   *
   * @param tenantId - Tenant ID
   * @param options - Query options
   * @returns Current balance (excludes expired credits)
   */
  async getBalance(tenantId: string, options?: QueryOptions): Promise<number> {
    return this.creditLedgerRepository.getBalance(tenantId, options);
  }

  /**
   * Get transaction history
   *
   * Returns paginated credit ledger entries ordered by recorded_at DESC.
   *
   * @param tenantId - Tenant ID
   * @param limit - Page size (default 50)
   * @param cursor - Pagination cursor (recorded_at timestamp)
   * @param options - Query options
   * @returns Array of credit transactions
   */
  async getTransactionHistory(
    tenantId: string,
    limit: number = 50,
    cursor?: string,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction[]> {
    const execute = async (client: PoolClient) => {
      return this.creditLedgerRepository.getTransactionHistory(
        tenantId,
        limit,
        cursor,
        { client, ...options },
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

  private async recordTransaction(
    input: RecordTransactionInput,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const {
      tenantId,
      transactionType,
      amount,
      featureId,
      usageLedgerId,
      reason,
      appliedBy,
      expiresAt,
      metadata,
    } = input;

    const execute = async (client: PoolClient) => {
      const currentBalance = await this.creditLedgerRepository.getBalance(
        tenantId,
        { client },
      );

      const newBalance = currentBalance + amount;

      if (newBalance < 0) {
        throw new BadRequestException(
          `Insufficient credits. Current balance: ${currentBalance}, requested: ${Math.abs(amount)}`,
        );
      }

      const transaction = await this.creditLedgerRepository.record(
        {
          tenant_id: tenantId,
          transaction_type: transactionType,
          amount,
          balance_after: newBalance,
          feature_id: featureId,
          usage_ledger_id: usageLedgerId,
          reason,
          applied_by: appliedBy,
          expires_at: expiresAt,
          metadata: metadata ? JSON.stringify(metadata) : '{}',
        },
        { client },
      );

      await this.emitCreditEvent(transaction, transactionType, appliedBy, {
        client,
      });

      this.logger.log(
        `Credit transaction recorded: id=${transaction.id}, tenant=${tenantId}, type=${transactionType}, amount=${amount}, balance=${newBalance}`,
      );

      return transaction;
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
   * Emit domain event for credit transaction
   *
   * @param transaction - The recorded credit transaction
   * @param transactionType - Transaction type
   * @param actorId - User ID who performed the action (optional)
   * @param options - Query options
   */
  private async emitCreditEvent(
    transaction: CreditLedgerTransaction,
    transactionType: CreditTransactionType,
    actorId?: string,
    options?: QueryOptions,
  ): Promise<void> {
    const eventTypeMap: Record<CreditTransactionType, string> = {
      purchase: 'credit.purchased',
      grant: 'credit.granted',
      deduction: 'credit.deducted',
      refund: 'credit.refunded',
      expiry: 'credit.expired',
    };

    // Parse transaction metadata to include in event payload
    const transactionMetadata =
      typeof transaction.metadata === 'string'
        ? JSON.parse(transaction.metadata)
        : transaction.metadata;

    await this.domainEventsService.emit(
      {
        tenant_id: transaction.tenant_id,
        event_type: eventTypeMap[transactionType],
        aggregate_type: 'credit',
        aggregate_id: transaction.id,
        actor_id: actorId,
        actor_type: actorId ? 'user' : 'system',
        payload: JSON.stringify({
          transaction_id: transaction.id,
          transaction_type: transactionType,
          amount: transaction.amount,
          balance_after: transaction.balance_after,
          feature_id: transaction.feature_id,
          usage_ledger_id: transaction.usage_ledger_id,
          reason: transaction.reason,
          expires_at: transaction.expires_at,
          // Include credit cost information from metadata (for deductions)
          credit_cost_per_unit: transactionMetadata?.credit_cost_per_unit,
          units_consumed: transactionMetadata?.units_consumed,
        }),
        metadata: JSON.stringify({
          recorded_at: transaction.recorded_at,
          idempotency_key: transaction.idempotency_key,
          ...transactionMetadata, // Include all metadata for audit trail
        }),
      },
      options,
    );
  }
}
