// SHELL: This service requires billing integration to be fully functional

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import {
  CreditPackage,
  TenantCredits,
  CreditTransaction,
  TenantCreditsSummary,
  CreditBalance,
  mapCreditPackageRow,
  mapTenantCreditsRow,
  mapCreditTransactionRow,
  CreditPackageRow,
  TenantCreditsRow,
  CreditTransactionRow,
} from './entities/credits.entity';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Get all available credit packages
   */
  async getAvailablePackages(): Promise<CreditPackage[]> {
    try {
      const result = await this.databaseService.query(
        `SELECT id, name, feature_key, credits, price_aed, is_active, created_at
         FROM public.credit_packages
         WHERE is_active = true
         ORDER BY feature_key, credits`,
      );

      return result.rows.map((row) =>
        mapCreditPackageRow(row as CreditPackageRow),
      );
    } catch (error) {
      this.logger.error('Failed to get available packages', error);
      throw new InternalServerErrorException(
        'Failed to retrieve credit packages',
      );
    }
  }

  /**
   * Get a specific credit package by ID
   */
  async getPackageById(packageId: string): Promise<CreditPackage> {
    try {
      const result = await this.databaseService.query(
        `SELECT id, name, feature_key, credits, price_aed, is_active, created_at
         FROM public.credit_packages
         WHERE id = $1`,
        [packageId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Credit package ${packageId} not found`);
      }

      return mapCreditPackageRow(result.rows[0] as CreditPackageRow);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to get package ${packageId}`, error);
      throw new InternalServerErrorException(
        'Failed to retrieve credit package',
      );
    }
  }

  /**
   * Get tenant's credit balance for a specific feature
   */
  async getTenantCredits(
    tenantId: string,
    featureKey: string,
  ): Promise<TenantCredits | null> {
    try {
      const result = await this.databaseService.query(
        `SELECT id, tenant_id, feature_key, credits_remaining, expires_at, created_at, updated_at
         FROM public.tenant_credits
         WHERE tenant_id = $1 AND feature_key = $2
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [tenantId, featureKey],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapTenantCreditsRow(result.rows[0] as TenantCreditsRow);
    } catch (error) {
      this.logger.error(
        `Failed to get credits for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve tenant credits',
      );
    }
  }

  /**
   * Get all credit balances for a tenant
   */
  async getTenantCreditsSummary(
    tenantId: string,
  ): Promise<TenantCreditsSummary> {
    try {
      const result = await this.databaseService.query(
        `SELECT id, tenant_id, feature_key, credits_remaining, expires_at, created_at, updated_at
         FROM public.tenant_credits
         WHERE tenant_id = $1
           AND credits_remaining > 0
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY feature_key`,
        [tenantId],
      );

      const balances: CreditBalance[] = result.rows.map((row) => {
        const credits = mapTenantCreditsRow(row as TenantCreditsRow);
        return {
          featureKey: credits.featureKey,
          creditsRemaining: credits.creditsRemaining,
          expiresAt: credits.expiresAt,
        };
      });

      return {
        tenantId,
        balances,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get credits summary for tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve credits summary',
      );
    }
  }

  /**
   * Purchase credits for a tenant
   *
   * TODO: Integrate with billing provider (Stripe)
   * - Create payment intent
   * - Process payment
   * - Update transaction status on webhook
   *
   * @param tenantId - The tenant purchasing credits
   * @param packageId - The credit package to purchase
   * @param paymentReference - External payment reference (from Stripe)
   * @returns The created transaction
   */
  async purchaseCredits(
    tenantId: string,
    packageId: string,
    paymentReference?: string,
  ): Promise<CreditTransaction> {
    // TODO: Integrate with billing provider (Stripe)
    // 1. Create Stripe payment intent
    // 2. Return client secret for frontend to complete payment
    // 3. On successful payment webhook, complete the transaction

    try {
      const pkg = await this.getPackageById(packageId);

      if (!pkg.isActive) {
        throw new BadRequestException(
          'This credit package is no longer available',
        );
      }

      // Create pending transaction
      // TODO: In production, this should only be completed via webhook after payment confirmation
      const transactionResult = await this.databaseService.query(
        `INSERT INTO public.credit_transactions
          (tenant_id, package_id, credits, price_aed, payment_reference, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        [
          tenantId,
          packageId,
          pkg.credits,
          pkg.priceAed,
          paymentReference || null,
        ],
      );

      const transaction = mapCreditTransactionRow(
        transactionResult.rows[0] as CreditTransactionRow,
      );

      this.logger.log(
        `Created pending credit purchase for tenant ${tenantId}, package ${pkg.name}`,
      );

      // TODO: Return Stripe client secret for payment completion
      // For now, just return the pending transaction
      return transaction;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to purchase credits for tenant ${tenantId}, package ${packageId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to process credit purchase',
      );
    }
  }

  /**
   * Complete a credit purchase (called by payment webhook)
   *
   * TODO: Implement webhook handler
   *
   * @param transactionId - The transaction to complete
   * @param paymentReference - Payment confirmation reference
   */
  async completeTransaction(
    transactionId: string,
    paymentReference: string,
  ): Promise<CreditTransaction> {
    // TODO: Implement payment confirmation webhook handler
    // 1. Verify payment with Stripe
    // 2. Update transaction status to 'completed'
    // 3. Add credits to tenant balance

    try {
      // Get the transaction
      const txResult = await this.databaseService.query(
        `SELECT * FROM public.credit_transactions WHERE id = $1`,
        [transactionId],
      );

      if (txResult.rows.length === 0) {
        throw new NotFoundException(`Transaction ${transactionId} not found`);
      }

      const tx = mapCreditTransactionRow(
        txResult.rows[0] as CreditTransactionRow,
      );

      if (tx.status !== 'pending') {
        throw new BadRequestException(`Transaction is already ${tx.status}`);
      }

      // Get the package to know the feature key
      const pkg = await this.getPackageById(tx.packageId);

      await this.databaseService.transaction(async (client) => {
        // Update transaction status
        await client.query(
          `UPDATE public.credit_transactions
           SET status = 'completed', payment_reference = $1
           WHERE id = $2`,
          [paymentReference, transactionId],
        );

        // Add credits to tenant balance (upsert)
        await client.query(
          `INSERT INTO public.tenant_credits
            (tenant_id, feature_key, credits_remaining)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, feature_key)
           DO UPDATE SET
             credits_remaining = tenant_credits.credits_remaining + $3,
             updated_at = now()`,
          [tx.tenantId, pkg.featureKey, tx.credits],
        );
      });

      this.logger.log(
        `Completed credit transaction ${transactionId} for tenant ${tx.tenantId}`,
      );

      // Return updated transaction
      const updatedResult = await this.databaseService.query(
        `SELECT * FROM public.credit_transactions WHERE id = $1`,
        [transactionId],
      );

      return mapCreditTransactionRow(
        updatedResult.rows[0] as CreditTransactionRow,
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to complete transaction ${transactionId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to complete transaction');
    }
  }

  /**
   * Consume a credit for a feature
   * Deducts 1 credit from the tenant's balance
   *
   * @param tenantId - The tenant consuming the credit
   * @param featureKey - The feature to consume credit for
   * @returns true if credit was consumed, false if no credits available
   */
  async consumeCredit(tenantId: string, featureKey: string): Promise<boolean> {
    try {
      const result = await this.databaseService.query(
        `UPDATE public.tenant_credits
         SET credits_remaining = credits_remaining - 1, updated_at = now()
         WHERE tenant_id = $1
           AND feature_key = $2
           AND credits_remaining > 0
           AND (expires_at IS NULL OR expires_at > NOW())
         RETURNING id, credits_remaining`,
        [tenantId, featureKey],
      );

      if (result.rowCount === 0) {
        this.logger.debug(
          `No credits available for tenant ${tenantId}, feature ${featureKey}`,
        );
        return false;
      }

      this.logger.debug(
        `Consumed 1 credit for tenant ${tenantId}, feature ${featureKey}. Remaining: ${result.rows[0].credits_remaining}`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to consume credit for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException('Failed to consume credit');
    }
  }

  /**
   * Check if tenant has available credits for a feature
   *
   * @param tenantId - The tenant to check
   * @param featureKey - The feature to check credits for
   * @returns Number of available credits (0 if none)
   */
  async getAvailableCredits(
    tenantId: string,
    featureKey: string,
  ): Promise<number> {
    try {
      const result = await this.databaseService.query(
        `SELECT COALESCE(SUM(credits_remaining), 0) as total
         FROM public.tenant_credits
         WHERE tenant_id = $1
           AND feature_key = $2
           AND credits_remaining > 0
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [tenantId, featureKey],
      );

      return parseInt(String(result.rows[0]?.total ?? '0'), 10);
    } catch (error) {
      this.logger.error(
        `Failed to check available credits for tenant ${tenantId}, feature ${featureKey}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to check available credits',
      );
    }
  }

  /**
   * Get transaction history for a tenant
   *
   * @param tenantId - The tenant to get history for
   * @param limit - Maximum number of transactions to return
   */
  async getTransactionHistory(
    tenantId: string,
    limit = 50,
  ): Promise<CreditTransaction[]> {
    try {
      const result = await this.databaseService.query(
        `SELECT id, tenant_id, package_id, credits, price_aed, payment_reference, status, created_at
         FROM public.credit_transactions
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenantId, limit],
      );

      return result.rows.map((row) =>
        mapCreditTransactionRow(row as CreditTransactionRow),
      );
    } catch (error) {
      this.logger.error(
        `Failed to get transaction history for tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve transaction history',
      );
    }
  }
}
