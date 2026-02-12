import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  CreditLedgerTransaction,
  CreditTransactionType,
} from '../../../common/types/entitlement.types';
import { DatabaseService } from '../../../database/database.service';
import { QueryOptions } from '../../../repositories/base/repository.interface';
import { CreditLedgerRepository } from '../../../repositories/credits/credit-ledger.repository';
import { DomainEventsService } from './domain-events.service';
import { FeaturesRepository } from '../../../repositories/features/features.repository';

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

  /**
   * Purchase credits
   *
   * Records a credit purchase transaction with positive amount.
   *
   * @param tenantId - Tenant ID
   * @param amount - Number of credits to purchase (must be > 0)
   * @param metadata - Additional metadata (e.g., payment reference, invoice ID)
   * @param options - Query options (optional client for shared transactions)
   * @returns The recorded credit transaction
   *
   * @throws BadRequestException - Invalid amount
   */
  async purchase(
    tenantId: string,
    amount: number,
    metadata?: Record<string, any>,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Purchase amount must be greater than 0');
    }

    this.logger.debug(
      `Purchasing credits: tenant=${tenantId}, amount=${amount}`,
    );

    return this.recordTransaction(
      tenantId,
      'purchase',
      amount,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metadata,
      options,
    );

    // TODO: BullMQ - Emit credit.purchased event to queue for async notification
  }

  /**
   * Grant credits (promotional or admin-applied)
   *
   * Records a credit grant transaction with positive amount and optional expiry.
   *
   * @param tenantId - Tenant ID
   * @param amount - Number of credits to grant (must be > 0)
   * @param reason - Reason for the grant (e.g., "welcome_bonus", "compensation")
   * @param expiresAt - Optional expiry date for the credits
   * @param appliedBy - User ID of admin who granted the credits
   * @param metadata - Additional metadata
   * @param options - Query options
   * @returns The recorded credit transaction
   *
   * @throws BadRequestException - Invalid amount
   */
  async grant(
    tenantId: string,
    amount: number,
    reason: string,
    expiresAt?: Date,
    appliedBy?: string,
    metadata?: Record<string, any>,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Grant amount must be greater than 0');
    }

    this.logger.debug(
      `Granting credits: tenant=${tenantId}, amount=${amount}, reason=${reason}`,
    );

    return this.recordTransaction(
      tenantId,
      'grant',
      amount,
      undefined,
      undefined,
      reason,
      appliedBy,
      expiresAt,
      metadata,
      options,
    );

    // TODO: BullMQ - Emit credit.granted event to queue for async notification
  }

  /**
   * Deduct credits
   *
   * Records a credit deduction transaction with negative amount.
   * Links to the usage event that triggered the deduction.
   *
   * @param tenantId - Tenant ID
   * @param amount - Number of credits to deduct (must be > 0, will be stored as negative)
   * @param featureId - Feature ID (optional, for feature-specific credits)
   * @param usageLedgerId - Usage ledger event ID that triggered the deduction
   * @param metadata - Additional metadata
   * @param options - Query options (optional client for shared transactions)
   * @returns The recorded credit transaction
   *
   * @throws BadRequestException - Invalid amount or insufficient balance
   */
  async deduct(
    tenantId: string,
    amount: number,
    featureId?: string,
    usageLedgerId?: string,
    metadata?: Record<string, any>,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Deduction amount must be greater than 0');
    }

    this.logger.debug(
      `Deducting credits: tenant=${tenantId}, amount=${amount}`,
    );

    return this.recordTransaction(
      tenantId,
      'deduction',
      -amount, // Store as negative
      featureId,
      usageLedgerId,
      undefined,
      undefined,
      undefined,
      metadata,
      options,
    );

    // TODO: BullMQ - Emit credit.deducted event to queue for async notification
    // (email alert when balance is low)
  }

  /**
   * Refund credits
   *
   * Records a credit refund transaction with positive amount.
   *
   * @param tenantId - Tenant ID
   * @param amount - Number of credits to refund (must be > 0)
   * @param reason - Reason for the refund
   * @param metadata - Additional metadata
   * @param options - Query options
   * @returns The recorded credit transaction
   *
   * @throws BadRequestException - Invalid amount
   */
  async refund(
    tenantId: string,
    amount: number,
    reason: string,
    metadata?: Record<string, any>,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than 0');
    }

    this.logger.debug(
      `Refunding credits: tenant=${tenantId}, amount=${amount}`,
    );

    return this.recordTransaction(
      tenantId,
      'refund',
      amount,
      undefined,
      undefined,
      reason,
      undefined,
      undefined,
      metadata,
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
    return this.databaseService.transactionWithTenantContext(tenantId, execute);
  }

  /**
   * Record a credit transaction (internal helper)
   *
   * Computes balance_after within a transaction and records the transaction.
   * Emits domain events for audit trail.
   *
   * @param tenantId - Tenant ID
   * @param transactionType - Type of transaction
   * @param amount - Amount (positive for credit, negative for deduction)
   * @param featureId - Feature ID (optional)
   * @param usageLedgerId - Usage ledger event ID (optional)
   * @param reason - Reason (optional)
   * @param appliedBy - User ID who applied the transaction (optional)
   * @param expiresAt - Expiry date (optional)
   * @param metadata - Additional metadata
   * @param options - Query options
   * @returns The recorded credit transaction
   */
  private async recordTransaction(
    tenantId: string,
    transactionType: CreditTransactionType,
    amount: number,
    featureId?: string,
    usageLedgerId?: string,
    reason?: string,
    appliedBy?: string,
    expiresAt?: Date,
    metadata?: Record<string, any>,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const execute = async (client: PoolClient) => {
      // Step 1: Get current balance
      const currentBalance = await this.creditLedgerRepository.getBalance(
        tenantId,
        { client },
      );

      // Step 2: Compute new balance
      const newBalance = currentBalance + amount;

      // Step 3: Validate balance (prevent negative balance for deductions)
      if (newBalance < 0) {
        throw new BadRequestException(
          `Insufficient credits. Current balance: ${currentBalance}, requested: ${Math.abs(amount)}`,
        );
      }

      // Step 4: Record transaction with balance_after
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

      // Step 5: Emit domain event
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

    return this.databaseService.transactionWithTenantContext(tenantId, execute);
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
        }),
        metadata: JSON.stringify({
          recorded_at: transaction.recorded_at,
          idempotency_key: transaction.idempotency_key,
        }),
      },
      options,
    );
  }
}
