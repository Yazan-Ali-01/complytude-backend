import { Injectable, Logger } from '@nestjs/common';
import { DunningEmailJobData, Job } from '@lib/queue';
import { DatabaseService } from '@lib/database';
import { TenantRepository } from '../../../repositories/tenants/tenant.repository';
import { EmailService } from '../../email/email.service';

@Injectable()
export class DunningEmailHandler {
  private readonly logger = new Logger(DunningEmailHandler.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
  ) {}

  async execute(job: Job<DunningEmailJobData>): Promise<void> {
    const data = job.data;

    this.logger.log(
      `Processing dunning email job: tenant=${data.tenantId}, sequence=${data.dunningSequence}, email=${data.tenantAdminEmail}`,
    );

    const locale = await this.getTenantLocale(data.tenantId);

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
        locale,
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

  private async getTenantLocale(tenantId: string): Promise<string> {
    try {
      const tenant =
        await this.databaseService.transactionWithPlatformAdminContext(
          async (client) =>
            this.tenantRepository.findById(tenantId, { client }),
        );
      return tenant?.locale ?? 'en';
    } catch (error) {
      this.logger.warn(
        `Failed to fetch tenant locale for ${tenantId}, using 'en': ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'en';
    }
  }
}
