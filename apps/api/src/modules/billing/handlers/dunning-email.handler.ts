import { Injectable, Logger } from '@nestjs/common';
import { DunningEmailJobData, Job } from '@lib/queue';
import { EmailService } from '../../email/email.service';

@Injectable()
export class DunningEmailHandler {
  private readonly logger = new Logger(DunningEmailHandler.name);

  constructor(private readonly emailService: EmailService) {}

  async execute(job: Job<DunningEmailJobData>): Promise<void> {
    const data = job.data;

    this.logger.log(
      `Processing dunning email job: tenant=${data.tenantId}, sequence=${data.dunningSequence}, email=${data.tenantAdminEmail}`,
    );

    try {
      await this.emailService.sendDunningEmail(
        data.dunningSequence,
        {
          tenantAdminEmail: data.tenantAdminEmail,
          tenantName: data.tenantName,
          invoiceId: data.invoiceId,
          hostedInvoiceUrl: data.hostedInvoiceUrl,
          attemptCount: data.attemptCount,
          amount: data.amount,
          currency: data.currency,
          dueDate: data.dueDate,
          supportEmail: process.env.SUPPORT_EMAIL || 'support@complytude.com',
        },
        'en', // TODO: Get tenant locale from database
      );

      this.logger.log(
        `Dunning email sent successfully: tenant=${data.tenantId}, sequence=${data.dunningSequence}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send dunning email: tenant=${data.tenantId}, sequence=${data.dunningSequence}`,
        error.stack,
      );
      throw error; // Re-throw to trigger BullMQ retry
    }
  }
}
