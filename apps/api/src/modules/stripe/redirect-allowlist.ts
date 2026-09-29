import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { CommonI18n } from 'src/common/constants/i18n.constants';

/** Origins Stripe may send the customer back to: the web app's (FRONTEND_URL) and CORS_ORIGINS. */
export function allowedRedirectOrigins(config: ConfigService): string[] {
  const candidates = [
    config.get<string>('FRONTEND_URL'),
    ...(config.get<string[]>('app.corsOrigins') ?? []),
  ];
  const origins = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      origins.add(new URL(candidate.trim()).origin);
    } catch {
      // Not a URL: allows nothing
    }
  }
  return [...origins];
}

/**
 * A checkout or portal page returns the customer to this URL: it must be on our own web app, or a
 * genuine checkout.stripe.com link could bounce people to any site (phishing).
 */
export function assertAllowedRedirect(url: string, allowed: string[]): void {
  let origin: string | null = null;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = null;
  }
  if (!origin || !allowed.includes(origin)) {
    throw new BadRequestException(
      I18nContext.current()?.t(CommonI18n.errors.REDIRECT_NOT_ALLOWED) ??
        'This return address is not allowed',
    );
  }
}
