import { EntitlementCreditNotificationJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { LOW_CREDIT_BALANCE_THRESHOLD } from 'src/common/constants/credit-packages.constant';
import { EmailService } from '../../email/email.service';
import { TenantContactsService } from '../../email/tenant-contacts.service';

/**
 * Credit Notification Handler
 *
 * Handles CREDIT_NOTIFICATION jobs. A deduction that takes the balance below the low-balance
 * threshold emails the tenant's admins; later deductions below it don't (they didn't cross it).
 * Purchases are receipted by Stripe.
 */
@Injectable()
export class CreditNotificationHandler {
  private readonly logger = new Logger(CreditNotificationHandler.name);

  constructor(
    private readonly contacts: TenantContactsService,
    private readonly emailService: EmailService,
  ) {}

  async execute(job: Job<EntitlementCreditNotificationJobData>): Promise<void> {
    const { tenantId, transactionType, amount, remainingBalance } = job.data;

    this.logger.debug(
      `Credit notification: tenant=${tenantId} type=${transactionType} amount=${amount} balance=${remainingBalance}`,
    );

    const before = remainingBalance + Math.abs(amount);
    const crossedLow =
      transactionType === 'deducted' &&
      remainingBalance < LOW_CREDIT_BALANCE_THRESHOLD &&
      before >= LOW_CREDIT_BALANCE_THRESHOLD;
    if (!crossedLow) return;

    const contacts = await this.contacts.resolve(tenantId);
    if (!contacts || contacts.recipients.length === 0) {
      this.logger.warn(
        `Low-credit email: no recipients for tenant ${tenantId}`,
      );
      return;
    }
    await this.emailService.sendLowCreditBalanceEmail(
      {
        recipients: contacts.recipients,
        tenantName: contacts.tenantName,
        balance: remainingBalance,
      },
      contacts.locale,
    );
  }
}
