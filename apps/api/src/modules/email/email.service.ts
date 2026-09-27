import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import {
  CURRENCY_UTILS,
  DEFAULT_CURRENCY_LOWERCASE,
} from 'src/common/constants/billing.constant';
import { emailConfig, EmailConfig } from 'src/config/email.config';
import { EmailI18n } from './constants/i18n.constants';

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

export interface PaymentActionRequiredEmailData {
  tenantAdminEmail: string;
  tenantName?: string;
  invoiceId: string;
  hostedInvoiceUrl: string;
  amount: number;
  currency: string;
  supportEmail: string;
}

export interface TrialEndingEmailData {
  /** One or more recipients (tenant_admin user email and/or billing_email). */
  recipients: string[];
  tenantName?: string;
  /** Days remaining until trial ends (used for subject and body). */
  daysRemaining: number;
  /** Absolute trial end timestamp. Localised for display. */
  trialEndsAt: Date;
  /** Frontend pricing/upgrade page URL. */
  upgradeUrl: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly sesClient: SESClient;
  private readonly config: EmailConfig;
  private readonly skipSend: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.config = emailConfig(configService);
    this.skipSend =
      this.configService.get<string>('EMAIL_SKIP_SEND', 'false') === 'true';
    this.sesClient = new SESClient({
      region: this.config.awsRegion,
    });
  }

  async sendVerificationEmail(
    email: string,
    token: string,
    locale: string = 'en',
  ): Promise<void> {
    if (this.skipSend) {
      this.logger.log(
        `Skipping verification email (EMAIL_SKIP_SEND): to=${email}`,
      );
      return;
    }
    const verificationUrl = `${this.config.frontendUrl}/verify-email?token=${token}`;
    const subject = this.i18n.t(EmailI18n.verification.SUBJECT, {
      lang: locale,
    });
    const htmlBody = this.renderVerificationHtml(verificationUrl, locale);
    const textBody = this.renderVerificationText(verificationUrl, locale);

    try {
      const command = new SendEmailCommand({
        Source: `${this.config.fromName} <${this.config.fromEmail}>`,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: htmlBody, Charset: 'UTF-8' },
            Text: { Data: textBody, Charset: 'UTF-8' },
          },
        },
        Tags: [{ Name: 'EmailType', Value: 'verification' }],
      });

      await this.sesClient.send(command);
      this.logger.log(`Verification email sent: email=${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email: email=${email}`,
        error.stack,
      );
      throw error;
    }
  }

  private renderVerificationHtml(
    verificationUrl: string,
    locale: string,
  ): string {
    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.i18n.t(EmailI18n.verification.SUBJECT, { lang: locale })}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #e7f3ff; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #b3d9ff; }
        .content { padding: 20px 0; }
        .cta-button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.i18n.t(EmailI18n.verification.BODY_LINK_TEXT, { lang: locale })}</h1>
    </div>
    <div class="content">
        <p>${this.i18n.t(EmailI18n.verification.BODY_INTRO, { lang: locale })}</p>
        <p>${this.i18n.t(EmailI18n.verification.BODY_CTA_HINT, { lang: locale })}</p>
        <a href="${verificationUrl}" class="cta-button">
            ${this.i18n.t(EmailI18n.verification.BODY_LINK_TEXT, { lang: locale })}
        </a>
        <p style="font-size: 14px; color: #666;">${this.i18n.t(EmailI18n.verification.BODY_IGNORE, { lang: locale })}</p>
    </div>
    <div class="footer">
        <p>${this.i18n.t('email.dunning.common.signature', { lang: locale })}</p>
    </div>
</body>
</html>`;
  }

  private renderVerificationText(
    verificationUrl: string,
    locale: string,
  ): string {
    return `
${this.i18n.t(EmailI18n.verification.BODY_INTRO, { lang: locale })}

${this.i18n.t(EmailI18n.verification.BODY_CTA_HINT, { lang: locale })}

${this.i18n.t(EmailI18n.verification.BODY_LINK_TEXT, { lang: locale })}: ${verificationUrl}

${this.i18n.t(EmailI18n.verification.BODY_IGNORE, { lang: locale })}

${this.i18n.t('email.dunning.common.signature', { lang: locale })}
`.trim();
  }

  async sendPasswordResetEmail(
    email: string,
    token: string,
    locale: string = 'en',
  ): Promise<void> {
    if (this.skipSend) {
      this.logger.log(
        `Skipping password reset email (EMAIL_SKIP_SEND): to=${email}`,
      );
      return;
    }
    const resetUrl = `${this.config.frontendUrl}/reset-password?token=${token}`;
    const subject = this.i18n.t(EmailI18n.passwordReset.SUBJECT, {
      lang: locale,
    });
    const htmlBody = this.renderPasswordResetHtml(resetUrl, locale);
    const textBody = this.renderPasswordResetText(resetUrl, locale);

    try {
      const command = new SendEmailCommand({
        Source: `${this.config.fromName} <${this.config.fromEmail}>`,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: htmlBody, Charset: 'UTF-8' },
            Text: { Data: textBody, Charset: 'UTF-8' },
          },
        },
        Tags: [{ Name: 'EmailType', Value: 'password_reset' }],
      });

      await this.sesClient.send(command);
      this.logger.log(`Password reset email sent: email=${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email: email=${email}`,
        error.stack,
      );
      throw error;
    }
  }

  private renderPasswordResetHtml(resetUrl: string, locale: string): string {
    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.i18n.t(EmailI18n.passwordReset.SUBJECT, { lang: locale })}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ffeaa7; }
        .content { padding: 20px 0; }
        .cta-button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.i18n.t(EmailI18n.passwordReset.BODY_LINK_TEXT, { lang: locale })}</h1>
    </div>
    <div class="content">
        <p>${this.i18n.t(EmailI18n.passwordReset.BODY_INTRO, { lang: locale })}</p>
        <p>${this.i18n.t(EmailI18n.passwordReset.BODY_CTA_HINT, { lang: locale })}</p>
        <a href="${resetUrl}" class="cta-button">
            ${this.i18n.t(EmailI18n.passwordReset.BODY_LINK_TEXT, { lang: locale })}
        </a>
        <p style="font-size: 14px; color: #666;">${this.i18n.t(EmailI18n.passwordReset.BODY_EXPIRY, { lang: locale })}</p>
        <p style="font-size: 14px; color: #666;">${this.i18n.t(EmailI18n.passwordReset.BODY_IGNORE, { lang: locale })}</p>
    </div>
    <div class="footer">
        <p>${this.i18n.t('email.dunning.common.signature', { lang: locale })}</p>
    </div>
</body>
</html>`;
  }

  private renderPasswordResetText(resetUrl: string, locale: string): string {
    return `
${this.i18n.t(EmailI18n.passwordReset.BODY_INTRO, { lang: locale })}

${this.i18n.t(EmailI18n.passwordReset.BODY_CTA_HINT, { lang: locale })}

${this.i18n.t(EmailI18n.passwordReset.BODY_LINK_TEXT, { lang: locale })}: ${resetUrl}

${this.i18n.t(EmailI18n.passwordReset.BODY_EXPIRY, { lang: locale })}

${this.i18n.t(EmailI18n.passwordReset.BODY_IGNORE, { lang: locale })}

${this.i18n.t('email.dunning.common.signature', { lang: locale })}
`.trim();
  }

  async sendPaymentActionRequiredEmail(
    data: PaymentActionRequiredEmailData,
    locale: string = 'en',
  ): Promise<void> {
    if (this.skipSend) {
      this.logger.log(
        `Skipping payment-action-required email (EMAIL_SKIP_SEND): to=${data.tenantAdminEmail}`,
      );
      return;
    }
    const tenantName = data.tenantName || 'Your Organization';
    const subject = this.i18n.t('email.payment_action_required.subject', {
      lang: locale,
      args: { tenantName },
    });
    const htmlBody = this.renderPaymentActionRequiredHtml(data, locale);
    const textBody = this.renderPaymentActionRequiredText(data, locale);

    try {
      const command = new SendEmailCommand({
        Source: `${this.config.fromName} <${this.config.fromEmail}>`,
        Destination: {
          ToAddresses: [data.tenantAdminEmail],
        },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: htmlBody, Charset: 'UTF-8' },
            Text: { Data: textBody, Charset: 'UTF-8' },
          },
        },
        Tags: [
          { Name: 'EmailType', Value: 'payment_action_required' },
          { Name: 'InvoiceId', Value: data.invoiceId },
        ],
      });

      await this.sesClient.send(command);
      this.logger.log(
        `Payment action required email sent: email=${data.tenantAdminEmail}, invoice=${data.invoiceId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send payment action required email: email=${data.tenantAdminEmail}`,
        error.stack,
      );
      throw error;
    }
  }

  private renderPaymentActionRequiredHtml(
    data: PaymentActionRequiredEmailData,
    locale: string,
  ): string {
    const tenantName = data.tenantName || 'Your Organization';
    const formattedAmount = this.formatCurrency(data.amount, data.currency);
    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.i18n.t('email.payment_action_required.title', { lang: locale })}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #e7f3ff; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #b3d9ff; }
        .content { padding: 20px 0; }
        .cta-button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
        .info { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.i18n.t('email.payment_action_required.title', { lang: locale })}</h1>
    </div>
    <div class="content">
        <p>${this.i18n.t('email.payment_action_required.greeting', { lang: locale, args: { tenantName } })}</p>
        <div class="info">
            <p>${this.i18n.t('email.payment_action_required.body', { lang: locale })}</p>
            <p><strong>${this.i18n.t('email.dunning.common.amount', { lang: locale })}:</strong> ${formattedAmount}</p>
        </div>
        <a href="${data.hostedInvoiceUrl}" class="cta-button">
            ${this.i18n.t('email.payment_action_required.cta', { lang: locale })}
        </a>
    </div>
    <div class="footer">
        <p>${this.i18n.t('email.dunning.common.questions', { lang: locale, args: { supportEmail: data.supportEmail } })}</p>
        <p>${this.i18n.t('email.dunning.common.signature', { lang: locale })}</p>
    </div>
</body>
</html>`;
  }

  private renderPaymentActionRequiredText(
    data: PaymentActionRequiredEmailData,
    locale: string,
  ): string {
    const tenantName = data.tenantName || 'Your Organization';
    const formattedAmount = this.formatCurrency(data.amount, data.currency);
    return `
${this.i18n.t('email.payment_action_required.title', { lang: locale })}

${this.i18n.t('email.payment_action_required.greeting', { lang: locale, args: { tenantName } })}

${this.i18n.t('email.payment_action_required.body', { lang: locale })}

${this.i18n.t('email.dunning.common.amount', { lang: locale })}: ${formattedAmount}

${this.i18n.t('email.payment_action_required.cta', { lang: locale })}: ${data.hostedInvoiceUrl}

${this.i18n.t('email.dunning.common.questions', { lang: locale, args: { supportEmail: data.supportEmail } })}

${this.i18n.t('email.dunning.common.signature', { lang: locale })}
`.trim();
  }

  /**
   * Send the "trial ending soon" reminder email to one or more recipients.
   *
   * Recipients are deduplicated. Designed to be called from the trial-reminder
   * cron handler exactly once per subscription (idempotency tracked at the
   * subscription row via `trial_reminder_sent_at`).
   */
  async sendTrialEndingEmail(
    data: TrialEndingEmailData,
    locale: string = 'en',
  ): Promise<void> {
    const uniqueRecipients = Array.from(new Set(data.recipients)).filter(
      (r) => !!r,
    );
    if (uniqueRecipients.length === 0) {
      this.logger.warn(
        `Trial ending email: no recipients resolved, tenantName=${data.tenantName ?? 'unknown'}`,
      );
      return;
    }
    if (this.skipSend) {
      this.logger.log(
        `Skipping trial ending email (EMAIL_SKIP_SEND): to=${uniqueRecipients.join(',')}`,
      );
      return;
    }

    const tenantName = data.tenantName || 'Your Organization';
    const subject = this.i18n.t('email.trial_ending.subject', {
      lang: locale,
      args: { daysRemaining: data.daysRemaining },
    });
    const htmlBody = this.renderTrialEndingHtml(data, tenantName, locale);
    const textBody = this.renderTrialEndingText(data, tenantName, locale);

    try {
      const command = new SendEmailCommand({
        Source: `${this.config.fromName} <${this.config.fromEmail}>`,
        Destination: { ToAddresses: uniqueRecipients },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: htmlBody, Charset: 'UTF-8' },
            Text: { Data: textBody, Charset: 'UTF-8' },
          },
        },
        Tags: [{ Name: 'EmailType', Value: 'trial_ending' }],
      });

      await this.sesClient.send(command);
      this.logger.log(
        `Trial ending email sent: to=${uniqueRecipients.join(',')}, daysRemaining=${data.daysRemaining}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send trial ending email: to=${uniqueRecipients.join(',')}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  private renderTrialEndingHtml(
    data: TrialEndingEmailData,
    tenantName: string,
    locale: string,
  ): string {
    const formattedDate = new Date(data.trialEndsAt).toLocaleDateString(
      locale === 'ar' ? 'ar-AE' : 'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' },
    );
    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.i18n.t('email.trial_ending.title', { lang: locale })}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #e7f3ff; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #b3d9ff; }
        .content { padding: 20px 0; }
        .cta-button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
        .info { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.i18n.t('email.trial_ending.title', { lang: locale })}</h1>
    </div>
    <div class="content">
        <p>${this.i18n.t('email.trial_ending.greeting', { lang: locale, args: { tenantName } })}</p>
        <p>${this.i18n.t('email.trial_ending.body', { lang: locale, args: { trialEndsAt: formattedDate } })}</p>
        <div class="info">
            <p><strong>${this.i18n.t('email.trial_ending.days_remaining', { lang: locale, args: { daysRemaining: data.daysRemaining } })}</strong></p>
        </div>
        <p>${this.i18n.t('email.trial_ending.after_trial', { lang: locale })}</p>
        <a href="${data.upgradeUrl}" class="cta-button">
            ${this.i18n.t('email.trial_ending.cta', { lang: locale })}
        </a>
        <p style="font-size: 14px; color: #666;">${this.i18n.t('email.trial_ending.ignore', { lang: locale })}</p>
    </div>
    <div class="footer">
        <p>${this.i18n.t('email.dunning.common.signature', { lang: locale })}</p>
    </div>
</body>
</html>`;
  }

  private renderTrialEndingText(
    data: TrialEndingEmailData,
    tenantName: string,
    locale: string,
  ): string {
    const formattedDate = new Date(data.trialEndsAt).toLocaleDateString(
      locale === 'ar' ? 'ar-AE' : 'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' },
    );
    return `
${this.i18n.t('email.trial_ending.title', { lang: locale })}

${this.i18n.t('email.trial_ending.greeting', { lang: locale, args: { tenantName } })}

${this.i18n.t('email.trial_ending.body', { lang: locale, args: { trialEndsAt: formattedDate } })}

${this.i18n.t('email.trial_ending.days_remaining', { lang: locale, args: { daysRemaining: data.daysRemaining } })}

${this.i18n.t('email.trial_ending.after_trial', { lang: locale })}

${this.i18n.t('email.trial_ending.cta', { lang: locale })}: ${data.upgradeUrl}

${this.i18n.t('email.trial_ending.ignore', { lang: locale })}

${this.i18n.t('email.dunning.common.signature', { lang: locale })}
`.trim();
  }

  async sendDunningEmail(
    sequence: 'day0' | 'day3' | 'day5',
    data: DunningEmailData,
    locale: string = 'en',
  ): Promise<void> {
    if (this.skipSend) {
      this.logger.log(
        `Skipping dunning email (EMAIL_SKIP_SEND): sequence=${sequence}, to=${data.tenantAdminEmail}`,
      );
      return;
    }
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
      currency.toLowerCase() === DEFAULT_CURRENCY_LOWERCASE
        ? CURRENCY_UTILS.filsToAed(amount)
        : amount;

    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(majorAmount);
  }
}
