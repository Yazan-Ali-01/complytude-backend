import { Injectable, Logger } from '@nestjs/common';
import { Job, PaymentActionRequiredJobData } from '@lib/queue';
import { EmailService } from '../../email/email.service';

@Injectable()
export class PaymentActionRequiredHandler {
  private readonly logger = new Logger(PaymentActionRequiredHandler.name);

  constructor(private readonly emailService: EmailService) {}

  async execute(job: Job<PaymentActionRequiredJobData>): Promise<void> {
    const data = job.data;

    this.logger.log(
      `Processing payment action required job: tenant=${data.tenantId}, email=${data.tenantAdminEmail}`,
    );

    try {
      await this.emailService.sendPaymentActionRequiredEmail(
        {
          tenantAdminEmail: data.tenantAdminEmail,
          tenantName: data.tenantName,
          invoiceId: data.invoiceId,
          hostedInvoiceUrl: data.hostedInvoiceUrl,
          amount: data.amount,
          currency: data.currency,
          supportEmail: process.env.SUPPORT_EMAIL || 'support@complytude.com',
        },
        'en', // TODO: Get tenant locale from database (P2 #11)
      );

      this.logger.log(
        `Payment action required email sent successfully: tenant=${data.tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send payment action required email: tenant=${data.tenantId}`,
        error.stack,
      );
      throw error; // Re-throw to trigger BullMQ retry
    }
  }
}
