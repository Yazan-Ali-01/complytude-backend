import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { AuthI18n } from '../constants/i18n.constants';

const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const PWNED_TIMEOUT_MS = 2000;

/**
 * Refuses new passwords known from data breaches (Have I Been Pwned, k-anonymity: only the first
 * 5 hex characters of the SHA-1 leave the server). If the service can't be reached the password
 * is accepted: an outage there must not stop sign-ups and resets.
 */
@Injectable()
export class PasswordPolicyService {
  private readonly logger = new Logger(PasswordPolicyService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  async assertNotBreached(password: string): Promise<void> {
    if (this.config.get<boolean>('PASSWORD_BREACH_CHECK_ENABLED') === false) {
      return;
    }
    const sha1 = crypto
      .createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();
    const [prefix, suffix] = [sha1.slice(0, 5), sha1.slice(5)];

    let body: string;
    try {
      const response = await fetch(`${PWNED_RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(PWNED_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      body = await response.text();
    } catch (error) {
      this.logger.warn(
        `Breached-password check unavailable, password accepted: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const breached = body.split('\n').some((line) => {
      const [hashSuffix, count] = line.trim().split(':');
      return hashSuffix === suffix && Number(count) > 0;
    });
    if (breached) {
      throw new BadRequestException(
        this.i18n.t(AuthI18n.errors.PASSWORD_BREACHED),
      );
    }
  }
}
