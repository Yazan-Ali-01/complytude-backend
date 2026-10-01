import { DatabaseService } from '@lib/database';
import type { EntitlementCreditExpiryCheckJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { CreditLedgerRepository } from 'src/repositories/credits/credit-ledger.repository';
import { CreditLedgerService } from '../services/credit-ledger.service';

const BATCH_SIZE = 500;

/**
 * Credit Expiry Handler
 *
 * Hourly: for every tenant holding a grant that has lapsed without an `expiry` row, writes the
 * rows that take its unspent remainder out of the balance. A tenant that fails is logged and
 * retried on the next run; the rest still settle.
 */
@Injectable()
export class CreditExpiryHandler {
  private readonly logger = new Logger(CreditExpiryHandler.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly creditLedgerRepository: CreditLedgerRepository,
    private readonly creditLedgerService: CreditLedgerService,
  ) {}

  async execute(
    _job?: Job<EntitlementCreditExpiryCheckJobData>,
  ): Promise<void> {
    const tenantIds =
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.creditLedgerRepository.findTenantsWithLapsedGrants(BATCH_SIZE, {
          client,
        }),
      );

    let rows = 0;
    for (const tenantId of tenantIds) {
      try {
        rows += await this.creditLedgerService.expireLapsedGrants(tenantId);
      } catch (error) {
        this.logger.error(
          `Credit expiry failed for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (tenantIds.length > 0) {
      this.logger.log(
        `Credit expiry: ${rows} expiry rows written for ${tenantIds.length} tenants`,
      );
    }
  }
}
