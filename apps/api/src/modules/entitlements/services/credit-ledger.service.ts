import { DatabaseService, QueryOptions } from '@lib/database';
import {
  ENTITLEMENT_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
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
import { EntitlementsI18n } from '../constants/i18n.constants';
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
    private readonly queueProducer: QueueProducerService,
    private readonly i18n: I18nService,
  ) {}

  async purchase(
    input: CreditPurchaseInput,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const { tenantId, amount, metadata } = input;
    if (amount <= 0) {
      throw new BadRequestException(
        this.i18n.t(EntitlementsI18n.errors.PURCHASE_AMOUNT_MUST_BE_GT_ZERO),
      );
    }

    this.logger.debug(
      `Purchasing credits: tenant=${tenantId}, amount=${amount}`,
    );

    const tx = await this.recordTransaction(
      {
        tenantId,
        transactionType: 'purchase',
        amount,
        metadata,
      },
      options,
    );

    await this.enqueueCreditNotification(
      tenantId,
      'purchased',
      amount,
      tx.balance_after,
    );
    return tx;
  }

  async grant(
    input: CreditGrantInput,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const { tenantId, amount, reason, expiresAt, appliedBy, metadata } = input;
    if (amount <= 0) {
      throw new BadRequestException(
        this.i18n.t(EntitlementsI18n.errors.GRANT_AMOUNT_MUST_BE_GT_ZERO),
      );
    }

    this.logger.debug(
      `Granting credits: tenant=${tenantId}, amount=${amount}, reason=${reason}`,
    );

    const tx = await this.recordTransaction(
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

    await this.enqueueCreditNotification(
      tenantId,
      'granted',
      amount,
      tx.balance_after,
    );
    return tx;
  }

  async deduct(
    input: CreditDeductInput,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const { tenantId, amount, featureId, usageLedgerId, metadata } = input;
    if (amount <= 0) {
      throw new BadRequestException(
        this.i18n.t(EntitlementsI18n.errors.DEDUCTION_AMOUNT_MUST_BE_GT_ZERO),
      );
    }

    this.logger.debug(
      `Deducting credits: tenant=${tenantId}, amount=${amount}, metadata=${JSON.stringify(metadata)}`,
    );

    const tx = await this.recordTransaction(
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

    await this.enqueueCreditNotification(
      tenantId,
      'deducted',
      amount,
      tx.balance_after,
    );
    return tx;
  }

  async refund(
    input: CreditRefundInput,
    options?: QueryOptions,
  ): Promise<CreditLedgerTransaction> {
    const { tenantId, amount, reason, metadata } = input;
    if (amount <= 0) {
      throw new BadRequestException(
        this.i18n.t(EntitlementsI18n.errors.REFUND_AMOUNT_MUST_BE_GT_ZERO),
      );
    }

    this.logger.debug(
      `Refunding credits: tenant=${tenantId}, amount=${amount}`,
    );

    const tx = await this.recordTransaction(
      {
        tenantId,
        transactionType: 'refund',
        amount,
        reason,
        metadata,
      },
      options,
    );
    await this.enqueueCreditNotification(
      tenantId,
      'refunded',
      amount,
      tx.balance_after,
    );
    return tx;
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
          this.i18n.t(EntitlementsI18n.errors.INSUFFICIENT_CREDITS, {
            args: {
              currentBalance: currentBalance.toString(),
              requested: Math.abs(amount).toString(),
            },
          }),
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
   * Enqueue credit notification for async processing (email, webhooks)
   */
  private async enqueueCreditNotification(
    tenantId: string,
    transactionType: 'purchased' | 'granted' | 'deducted' | 'refunded',
    amount: number,
    remainingBalance: number,
  ): Promise<void> {
    try {
      await this.queueProducer.enqueue(
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
        ENTITLEMENT_JOB_NAMES.CREDIT_NOTIFICATION,
        {
          tenantId,
          transactionType,
          amount,
          remainingBalance,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 500 } },
      );
    } catch (error) {
      this.logger.warn(
        `[credit.${transactionType}] Failed to enqueue notification: tenant=${tenantId} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
