import { DatabaseService, QueryOptions } from '@lib/database';
import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { CreditLedgerRepository } from '../../../repositories/credits/credit-ledger.repository';

/**
 * Credit Balance Service
 *
 * Read-only convenience layer for credit balance queries.
 * Provides high-level balance operations without mutating the ledger.
 *
 * Key responsibilities:
 * - Get available balance (excludes expired credits)
 * - Check if tenant has enough credits for an operation
 * - Provide balance breakdown by transaction type
 *
 * Architecture:
 * - All reads delegate to CreditLedgerRepository
 * - No mutations (use CreditLedgerService for writes)
 * - Can be called within transactions via QueryOptions
 */
@Injectable()
export class CreditBalanceService {
  private readonly logger = new Logger(CreditBalanceService.name);

  constructor(
    private readonly creditLedgerRepository: CreditLedgerRepository,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Get available credit balance for a tenant
   *
   * Returns the current balance excluding expired credits.
   *
   * @param tenantId - Tenant ID
   * @param options - Query options (optional client for shared transactions)
   * @returns Current available balance
   */
  async getAvailableBalance(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<number> {
    const execute = async (client: PoolClient) => {
      return this.creditLedgerRepository.getBalance(tenantId, { client });
    };

    const balance = options?.client
      ? await execute(options.client)
      : await this.databaseService.transactionWithTenantContext(
          { tenantId },
          execute,
        );

    this.logger.debug(`Balance query: tenantId=${tenantId} balance=${balance}`);
    return balance;
  }

  /**
   * Check if tenant has enough credits
   *
   * Non-mutating check to see if a deduction would succeed.
   *
   * @param tenantId - Tenant ID
   * @param amount - Amount to check (must be > 0)
   * @param options - Query options
   * @returns True if balance >= amount
   */
  async hasEnoughCredits(
    tenantId: string,
    amount: number,
    options?: QueryOptions,
  ): Promise<boolean> {
    const balance = await this.getAvailableBalance(tenantId, options);
    const hasEnough = balance >= amount;
    if (!hasEnough) {
      this.logger.warn(
        `Insufficient credits: tenantId=${tenantId} required=${amount} available=${balance}`,
      );
    }
    return hasEnough;
  }

  /**
   * Get balance breakdown by transaction type
   *
   * Returns totals for each transaction type:
   * - purchase: Total purchased credits
   * - grant: Total granted credits
   * - deduction: Total deducted credits (negative)
   * - refund: Total refunded credits
   * - expiry: Total expired credits (negative)
   *
   * Net balance = sum of all types.
   *
   * @param tenantId - Tenant ID
   * @param options - Query options
   * @returns Breakdown object with totals by type
   */
  async getBalanceBreakdown(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<{
    purchased: number;
    granted: number;
    deducted: number;
    refunded: number;
    expired: number;
    net: number;
  }> {
    const execute = async (client: PoolClient) => {
      return this.creditLedgerRepository.getBalanceBreakdown(tenantId, {
        client,
        ...options,
      });
    };
    const breakdown = options?.client
      ? await execute(options.client)
      : await this.databaseService.transactionWithTenantContext(
          { tenantId },
          execute,
        );

    const purchased = breakdown.purchase ?? 0;
    const granted = breakdown.grant ?? 0;
    const deducted = breakdown.deduction ?? 0; // Already negative
    const refunded = breakdown.refund ?? 0;
    const expired = breakdown.expiry ?? 0; // Already negative

    const net = purchased + granted + deducted + refunded + expired;

    this.logger.debug(
      `Balance breakdown: tenantId=${tenantId} net=${net} purchased=${purchased} granted=${granted} deducted=${deducted}`,
    );

    return {
      purchased,
      granted,
      deducted,
      refunded,
      expired,
      net,
    };
  }
}
