import { Logger, UnauthorizedException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { AuthI18n } from '../constants/i18n.constants';
import { SessionService } from '../services/session.service';

const logger = new Logger('SessionValidation');

export async function validateSessions(
  sessionService: SessionService,
  req: {
    auth?: {
      identity?: { sessionId?: string };
      tenant?: { sessionId?: string };
    };
  },
  authOptions: { tenant?: boolean; identity?: boolean },
  strictMode: boolean,
): Promise<void> {
  const i18n = I18nContext.current();
  const msg =
    i18n?.t(AuthI18n.errors.SESSION_EXPIRED_OR_INVALID) ??
    'Session expired or invalid';

  const validate = async (sessionId: string, type: 'identity' | 'tenant') => {
    if (!sessionId) {
      throw new UnauthorizedException(msg);
    }

    try {
      const exists =
        type === 'identity'
          ? await sessionService.identitySessionExistsPure(sessionId)
          : await sessionService.tenantSessionExistsPure(sessionId);
      if (!exists) {
        throw new UnauthorizedException(msg);
      }
      if (type === 'identity') {
        sessionService.touchIdentityActivity(sessionId);
      } else {
        sessionService.touchTenantActivity(sessionId);
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      if (strictMode) {
        logger.error(
          `Redis unavailable in strict mode, denying request: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new UnauthorizedException(msg);
      }
      logger.warn(
        `Redis unavailable, falling back to JWT-only validation: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  if (authOptions?.identity && req.auth?.identity) {
    await validate(req.auth.identity.sessionId ?? '', 'identity');
  }
  if (authOptions?.tenant && req.auth?.tenant) {
    await validate(req.auth.tenant.sessionId ?? '', 'tenant');
  }
}
