import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { Resend } from 'resend';
import { EmailI18n } from './constants/i18n.constants';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly skipSend: boolean;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    const apiKey = this.configService.get<string>('email.apiKey') || '';
    this.skipSend =
      this.configService.get<boolean>('email.skipSend') === true || !apiKey;
    this.from =
      this.configService.get<string>('email.from') || 'noreply@complytude.com';
    this.frontendUrl =
      this.configService.get<string>('email.frontendUrl') ||
      'http://localhost:3000';

    if (!this.skipSend && apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.log(
        'Email sending disabled (EMAIL_SKIP_SEND=true or EMAIL_API_KEY empty)',
      );
    }
  }

  /**
   * Send verification email (fire-and-forget, non-blocking).
   * Logs errors but does not throw — signup must not fail if email fails.
   */
  sendVerificationEmail(to: string, token: string): void {
    const subject = this.i18n.t(EmailI18n.verification.SUBJECT);
    const link = `${this.frontendUrl}/verify-email?token=${token}`;
    const html = this.buildTransactionalHtml({
      greeting: this.i18n.t(EmailI18n.common.GREETING),
      intro: this.i18n.t(EmailI18n.verification.BODY_INTRO),
      ctaHint: this.i18n.t(EmailI18n.verification.BODY_CTA_HINT),
      ctaLink: link,
      ctaText: this.i18n.t(EmailI18n.verification.BODY_LINK_TEXT),
      ignoreText: this.i18n.t(EmailI18n.verification.BODY_IGNORE),
      expiryText: null,
    });
    this.sendEmail(to, subject, html, 'verification');
  }

  /**
   * Send password reset email (fire-and-forget, non-blocking).
   * Logs errors but does not throw — forgot-password must not fail if email fails.
   */
  sendPasswordResetEmail(to: string, token: string): void {
    const subject = this.i18n.t(EmailI18n.passwordReset.SUBJECT);
    const link = `${this.frontendUrl}/reset-password?token=${token}`;
    const html = this.buildTransactionalHtml({
      greeting: this.i18n.t(EmailI18n.common.GREETING),
      intro: this.i18n.t(EmailI18n.passwordReset.BODY_INTRO),
      ctaHint: this.i18n.t(EmailI18n.passwordReset.BODY_CTA_HINT),
      ctaLink: link,
      ctaText: this.i18n.t(EmailI18n.passwordReset.BODY_LINK_TEXT),
      ignoreText: this.i18n.t(EmailI18n.passwordReset.BODY_IGNORE),
      expiryText: this.i18n.t(EmailI18n.passwordReset.BODY_EXPIRY),
    });
    this.sendEmail(to, subject, html, 'password-reset');
  }

  /**
   * Build transactional email HTML (Stripe-style: clean, minimal, CTA button).
   * Uses inline styles for email client compatibility.
   */
  private buildTransactionalHtml(params: {
    greeting: string;
    intro: string;
    ctaHint: string;
    ctaLink: string;
    ctaText: string;
    ignoreText: string;
    expiryText: string | null;
  }): string {
    const year = new Date().getFullYear();
    const footerBrand = this.i18n.t(EmailI18n.common.FOOTER_BRAND, {
      args: { year },
    });
    const footerHelp = this.i18n.t(EmailI18n.common.FOOTER_HELP);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complytude</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.5;color:#333;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 24px;font-size:18px;font-weight:600;color:#111;">Complytude</p>
              <p style="margin:0 0 16px;font-size:16px;color:#374151;">${params.greeting},</p>
              <p style="margin:0 0 24px;font-size:16px;color:#374151;">${params.intro}</p>
              <p style="margin:0 0 16px;font-size:14px;color:#6b7280;text-align:center;">${params.ctaHint}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 24px;">
                <tr>
                  <td style="border-radius:6px;background-color:#111;">
                    <a href="${params.ctaLink}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${params.ctaText}</a>
                  </td>
                </tr>
              </table>
              ${params.expiryText ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;">${params.expiryText}</p>` : ''}
              <p style="margin:0;font-size:13px;color:#9ca3af;">${params.ignoreText}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;background-color:#f9fafb;border-radius:0 0 8px 8px;">
              <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">${footerHelp}</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">${footerBrand}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Fire-and-forget send. Never throws — logs errors for graceful degradation.
   */
  private sendEmail(
    to: string,
    subject: string,
    html: string,
    type: string,
  ): void {
    if (this.skipSend) {
      this.logger.log(
        `[${type}] Would send to ${to}: ${subject} (log-only mode)`,
      );
      return;
    }

    if (!this.resend) {
      this.logger.warn(
        `[${type}] Email not sent to ${to}: Resend not configured`,
      );
      return;
    }

    this.resend.emails
      .send({
        from: this.from,
        to,
        subject,
        html,
      })
      .then((result) => {
        if (result.error) {
          this.logger.error(
            `[${type}] Failed to send email to ${to}: ${result.error.message}`,
          );
        } else {
          this.logger.log(`[${type}] Email sent to ${to}`);
        }
      })
      .catch((err) => {
        this.logger.error(
          `[${type}] Failed to send email to ${to}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
