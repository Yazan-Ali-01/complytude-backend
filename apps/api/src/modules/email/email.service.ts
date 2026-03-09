import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { emailConfig, EmailConfig } from 'src/config/email.config';

export interface DunningEmailData {
  tenantAdminEmail: string;
  tenantName?: string;
  invoiceId: string;
  hostedInvoiceUrl: string;
  attemptCount: number;
  amount: number;
  currency: string;
  dueDate: string;
  supportEmail: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly sesClient: SESClient;
  private readonly config: EmailConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.config = emailConfig(configService);
    this.sesClient = new SESClient({
      region: this.config.awsRegion,
    });
  }

  async sendDunningEmail(
    sequence: 'day0' | 'day3' | 'day5',
    data: DunningEmailData,
    locale: string = 'en',
  ): Promise<void> {
    const { subject, htmlBody, textBody } = this.renderDunningTemplate(
      sequence,
      data,
      locale,
    );

    try {
      const command = new SendEmailCommand({
        Source: `${this.config.fromName} <${this.config.fromEmail}>`,
        Destination: {
          ToAddresses: [data.tenantAdminEmail],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8',
            },
            Text: {
              Data: textBody,
              Charset: 'UTF-8',
            },
          },
        },
        Tags: [
          {
            Name: 'EmailType',
            Value: 'dunning',
          },
          {
            Name: 'DunningSequence',
            Value: sequence,
          },
          {
            Name: 'InvoiceId',
            Value: data.invoiceId,
          },
        ],
      });

      const result = await this.sesClient.send(command);

      this.logger.log(
        `Dunning email sent successfully: sequence=${sequence}, email=${data.tenantAdminEmail}, messageId=${result.MessageId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send dunning email: sequence=${sequence}, email=${data.tenantAdminEmail}`,
        error.stack,
      );
      throw error;
    }
  }

  private renderDunningTemplate(
    sequence: 'day0' | 'day3' | 'day5',
    data: DunningEmailData,
    locale: string,
  ): { subject: string; htmlBody: string; textBody: string } {
    const tenantName = data.tenantName || 'Your Organization';
    const formattedAmount = this.formatCurrency(data.amount, data.currency);
    const formattedDate = new Date(data.dueDate).toLocaleDateString(
      locale === 'ar' ? 'ar-AE' : 'en-US',
    );

    switch (sequence) {
      case 'day0':
        return {
          subject: this.i18n.t('email.dunning.day0.subject', {
            lang: locale,
            args: { tenantName },
          }),
          htmlBody: this.renderDay0Html(
            data,
            tenantName,
            formattedAmount,
            formattedDate,
            locale,
          ),
          textBody: this.renderDay0Text(
            data,
            tenantName,
            formattedAmount,
            formattedDate,
            locale,
          ),
        };

      case 'day3':
        return {
          subject: this.i18n.t('email.dunning.day3.subject', {
            lang: locale,
            args: { tenantName },
          }),
          htmlBody: this.renderDay3Html(
            data,
            tenantName,
            formattedAmount,
            formattedDate,
            locale,
          ),
          textBody: this.renderDay3Text(
            data,
            tenantName,
            formattedAmount,
            formattedDate,
            locale,
          ),
        };

      case 'day5':
        return {
          subject: this.i18n.t('email.dunning.day5.subject', {
            lang: locale,
            args: { tenantName },
          }),
          htmlBody: this.renderDay5Html(
            data,
            tenantName,
            formattedAmount,
            formattedDate,
            locale,
          ),
          textBody: this.renderDay5Text(
            data,
            tenantName,
            formattedAmount,
            formattedDate,
            locale,
          ),
        };

      default:
        throw new Error(`Unknown dunning sequence: ${sequence as string}`);
    }
  }

  private renderDay0Html(
    data: DunningEmailData,
    tenantName: string,
    formattedAmount: string,
    formattedDate: string,
    locale: string,
  ): string {
    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.i18n.t('email.dunning.day0.subject', { lang: locale, args: { tenantName } })}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .content { padding: 20px 0; }
        .cta-button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.i18n.t('email.dunning.day0.title', { lang: locale })}</h1>
    </div>
    
    <div class="content">
        <p>${this.i18n.t('email.dunning.day0.greeting', { lang: locale, args: { tenantName } })}</p>
        
        <div class="warning">
            <p><strong>${this.i18n.t('email.dunning.day0.payment_failed', { lang: locale })}</strong></p>
            <ul>
                <li>${this.i18n.t('email.dunning.common.amount', { lang: locale })}: ${formattedAmount}</li>
                <li>${this.i18n.t('email.dunning.common.due_date', { lang: locale })}: ${formattedDate}</li>
                <li>${this.i18n.t('email.dunning.common.attempt', { lang: locale })}: ${data.attemptCount}</li>
            </ul>
        </div>
        
        <p>${this.i18n.t('email.dunning.day0.action_required', { lang: locale })}</p>
        
        <a href="${data.hostedInvoiceUrl}" class="cta-button">
            ${this.i18n.t('email.dunning.common.update_payment', { lang: locale })}
        </a>
        
        <p>${this.i18n.t('email.dunning.day0.consequences', { lang: locale })}</p>
    </div>
    
    <div class="footer">
        <p>${this.i18n.t('email.dunning.common.questions', { lang: locale, args: { supportEmail: data.supportEmail } })}</p>
        <p>${this.i18n.t('email.dunning.common.signature', { lang: locale })}</p>
    </div>
</body>
</html>`;
  }

  private renderDay0Text(
    data: DunningEmailData,
    tenantName: string,
    formattedAmount: string,
    formattedDate: string,
    locale: string,
  ): string {
    return `
${this.i18n.t('email.dunning.day0.title', { lang: locale })}

${this.i18n.t('email.dunning.day0.greeting', { lang: locale, args: { tenantName } })}

${this.i18n.t('email.dunning.day0.payment_failed', { lang: locale })}

${this.i18n.t('email.dunning.common.amount', { lang: locale })}: ${formattedAmount}
${this.i18n.t('email.dunning.common.due_date', { lang: locale })}: ${formattedDate}
${this.i18n.t('email.dunning.common.attempt', { lang: locale })}: ${data.attemptCount}

${this.i18n.t('email.dunning.day0.action_required', { lang: locale })}

${this.i18n.t('email.dunning.common.update_payment', { lang: locale })}: ${data.hostedInvoiceUrl}

${this.i18n.t('email.dunning.day0.consequences', { lang: locale })}

${this.i18n.t('email.dunning.common.questions', { lang: locale, args: { supportEmail: data.supportEmail } })}

${this.i18n.t('email.dunning.common.signature', { lang: locale })}
`.trim();
  }

  private renderDay3Html(
    data: DunningEmailData,
    tenantName: string,
    formattedAmount: string,
    formattedDate: string,
    locale: string,
  ): string {
    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.i18n.t('email.dunning.day3.subject', { lang: locale, args: { tenantName } })}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ffeaa7; }
        .content { padding: 20px 0; }
        .cta-button { display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
        .urgent { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.i18n.t('email.dunning.day3.title', { lang: locale })}</h1>
    </div>
    
    <div class="content">
        <p>${this.i18n.t('email.dunning.day3.greeting', { lang: locale, args: { tenantName } })}</p>
        
        <div class="urgent">
            <p><strong>${this.i18n.t('email.dunning.day3.reminder', { lang: locale })}</strong></p>
            <ul>
                <li>${this.i18n.t('email.dunning.common.amount', { lang: locale })}: ${formattedAmount}</li>
                <li>${this.i18n.t('email.dunning.common.due_date', { lang: locale })}: ${formattedDate}</li>
            </ul>
        </div>
        
        <p>${this.i18n.t('email.dunning.day3.urgency', { lang: locale })}</p>
        
        <a href="${data.hostedInvoiceUrl}" class="cta-button">
            ${this.i18n.t('email.dunning.common.update_payment', { lang: locale })}
        </a>
        
        <p>${this.i18n.t('email.dunning.day3.consequences', { lang: locale })}</p>
    </div>
    
    <div class="footer">
        <p>${this.i18n.t('email.dunning.common.questions', { lang: locale, args: { supportEmail: data.supportEmail } })}</p>
        <p>${this.i18n.t('email.dunning.common.signature', { lang: locale })}</p>
    </div>
</body>
</html>`;
  }

  private renderDay3Text(
    data: DunningEmailData,
    tenantName: string,
    formattedAmount: string,
    formattedDate: string,
    locale: string,
  ): string {
    return `
${this.i18n.t('email.dunning.day3.title', { lang: locale })}

${this.i18n.t('email.dunning.day3.greeting', { lang: locale, args: { tenantName } })}

${this.i18n.t('email.dunning.day3.reminder', { lang: locale })}

${this.i18n.t('email.dunning.common.amount', { lang: locale })}: ${formattedAmount}
${this.i18n.t('email.dunning.common.due_date', { lang: locale })}: ${formattedDate}

${this.i18n.t('email.dunning.day3.urgency', { lang: locale })}

${this.i18n.t('email.dunning.common.update_payment', { lang: locale })}: ${data.hostedInvoiceUrl}

${this.i18n.t('email.dunning.day3.consequences', { lang: locale })}

${this.i18n.t('email.dunning.common.questions', { lang: locale, args: { supportEmail: data.supportEmail } })}

${this.i18n.t('email.dunning.common.signature', { lang: locale })}
`.trim();
  }

  private renderDay5Html(
    data: DunningEmailData,
    tenantName: string,
    formattedAmount: string,
    formattedDate: string,
    locale: string,
  ): string {
    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.i18n.t('email.dunning.day5.subject', { lang: locale, args: { tenantName } })}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8d7da; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #f5c6cb; }
        .content { padding: 20px 0; }
        .cta-button { display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
        .critical { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.i18n.t('email.dunning.day5.title', { lang: locale })}</h1>
    </div>
    
    <div class="content">
        <p>${this.i18n.t('email.dunning.day5.greeting', { lang: locale, args: { tenantName } })}</p>
        
        <div class="critical">
            <p><strong>${this.i18n.t('email.dunning.day5.final_notice', { lang: locale })}</strong></p>
            <ul>
                <li>${this.i18n.t('email.dunning.common.amount', { lang: locale })}: ${formattedAmount}</li>
                <li>${this.i18n.t('email.dunning.common.due_date', { lang: locale })}: ${formattedDate}</li>
            </ul>
        </div>
        
        <p>${this.i18n.t('email.dunning.day5.last_chance', { lang: locale })}</p>
        
        <a href="${data.hostedInvoiceUrl}" class="cta-button">
            ${this.i18n.t('email.dunning.common.update_payment', { lang: locale })}
        </a>
        
        <p>${this.i18n.t('email.dunning.day5.consequences', { lang: locale })}</p>
    </div>
    
    <div class="footer">
        <p>${this.i18n.t('email.dunning.common.questions', { lang: locale, args: { supportEmail: data.supportEmail } })}</p>
        <p>${this.i18n.t('email.dunning.common.signature', { lang: locale })}</p>
    </div>
</body>
</html>`;
  }

  private renderDay5Text(
    data: DunningEmailData,
    tenantName: string,
    formattedAmount: string,
    formattedDate: string,
    locale: string,
  ): string {
    return `
${this.i18n.t('email.dunning.day5.title', { lang: locale })}

${this.i18n.t('email.dunning.day5.greeting', { lang: locale, args: { tenantName } })}

${this.i18n.t('email.dunning.day5.final_notice', { lang: locale })}

${this.i18n.t('email.dunning.common.amount', { lang: locale })}: ${formattedAmount}
${this.i18n.t('email.dunning.common.due_date', { lang: locale })}: ${formattedDate}

${this.i18n.t('email.dunning.day5.last_chance', { lang: locale })}

${this.i18n.t('email.dunning.common.update_payment', { lang: locale })}: ${data.hostedInvoiceUrl}

${this.i18n.t('email.dunning.day5.consequences', { lang: locale })}

${this.i18n.t('email.dunning.common.questions', { lang: locale, args: { supportEmail: data.supportEmail } })}

${this.i18n.t('email.dunning.common.signature', { lang: locale })}
`.trim();
  }

  private formatCurrency(amount: number, currency: string): string {
    // Convert from smallest currency unit (fils for AED) to major unit
    const majorAmount =
      currency.toLowerCase() === 'aed' ? amount / 100 : amount;

    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(majorAmount);
  }
}
