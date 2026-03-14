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
    const welcome = this.i18n.t(EmailI18n.verification.BODY_WELCOME);
    const instructions = this.i18n.t(EmailI18n.verification.BODY_INSTRUCTIONS);
    const linkText = this.i18n.t(EmailI18n.verification.BODY_LINK_TEXT);
    const link = `${this.frontendUrl}/verify-email?token=${token}`;

    const html = `
      <p>${welcome}</p>
      <p>${instructions}</p>
      <p><a href="${link}">${linkText}</a></p>
    `;

    this.sendEmail(to, subject, html, 'verification');
  }

  /**
   * Send password reset email (fire-and-forget, non-blocking).
   * Logs errors but does not throw — forgot-password must not fail if email fails.
   */
  sendPasswordResetEmail(to: string, token: string): void {
    const subject = this.i18n.t(EmailI18n.passwordReset.SUBJECT);
    const instructions = this.i18n.t(EmailI18n.passwordReset.BODY_INSTRUCTIONS);
    const linkText = this.i18n.t(EmailI18n.passwordReset.BODY_LINK_TEXT);
    const expiry = this.i18n.t(EmailI18n.passwordReset.BODY_EXPIRY);
    const link = `${this.frontendUrl}/reset-password?token=${token}`;

    const html = `
      <p>${instructions}</p>
      <p><a href="${link}">${linkText}</a></p>
      <p>${expiry}</p>
    `;

    this.sendEmail(to, subject, html, 'password-reset');
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
