import {
  HttpException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { AuthI18n } from '../constants/i18n.constants';
import { SessionService } from '../services/session.service';

const logger = new Logger('SessionValidation');

/**
 * The session store (Redis) couldn't be asked. Sessions are then never accepted on the JWT alone
 * (a revoked session would work again), but the answer is 503, not 401: the caller retries
 * instead of logging the user out over a blip.
 */
export function sessionStoreUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    I18nContext.current()?.t(AuthI18n.errors.SESSION_STORE_UNAVAILABLE) ??
      'Sign-in is temporarily unavailable, try again shortly',
  );
}

/** Runs a session-store check; a store failure (not an HTTP error it threw) becomes a 503. */
export async function withSessionStore<T>(check: () => Promise<T>): Promise<T> {
  try {
    return await check();
  } catch (err) {
    if (err instanceof HttpException) throw err;
    logger.error(
      `Session store unavailable, refusing the request: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw sessionStoreUnavailable();
  }
}

export async function validateSessions(
  sessionService: SessionService,
  req: {
    auth?: {
      identity?: { sessionId?: string };
      tenant?: { sessionId?: string; tenantId?: string };
    };
  },
  authOptions: { tenant?: boolean; identity?: boolean },
): Promise<void> {
  const i18n = I18nContext.current();
  const msg =
    i18n?.t(AuthI18n.errors.SESSION_EXPIRED_OR_INVALID) ??
    'Session expired or invalid';

  const validate = async (
    sessionId: string,
    type: 'identity' | 'tenant',
    tenantId?: string,
  ) => {
    if (!sessionId) {
      throw new UnauthorizedException(msg);
    }

    await withSessionStore(async () => {
      const exists =
        type === 'identity'
          ? await sessionService.identitySessionExistsPure(sessionId)
          : await sessionService.tenantSessionExistsPure(sessionId);
      if (!exists) {
        throw new UnauthorizedException(msg);
      }
      // A deactivated tenant's tokens stop working at once, whatever session they carry
      if (tenantId && (await sessionService.isTenantInactive(tenantId))) {
        throw new UnauthorizedException(msg);
      }
    });
    if (type === 'identity') {
      sessionService.touchIdentityActivity(sessionId);
    } else {
      sessionService.touchTenantActivity(sessionId);
    }
  };

  if (authOptions?.identity && req.auth?.identity) {
    await validate(req.auth.identity.sessionId ?? '', 'identity');
  }
  if (authOptions?.tenant && req.auth?.tenant) {
    await validate(
      req.auth.tenant.sessionId ?? '',
      'tenant',
      req.auth.tenant.tenantId ?? '',
    );
  }
}
