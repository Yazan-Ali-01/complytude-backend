import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import passport from 'passport';
import { AuthI18n } from '../constants/i18n.constants';
import { AUTH_OPTIONS_KEY } from '../decorators/auth-options.decorator';
import { SessionService } from '../services/session.service';
import {
  JWT_IDENTITY_ACCESS_STRATEGY,
  JWT_TENANT_ACCESS_STRATEGY,
} from '../strategies';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const authOptions = this.reflector.getAllAndOverride<{
      tenant?: boolean;
      identity?: boolean;
    }>(AUTH_OPTIONS_KEY, [context.getHandler(), context.getClass()]);

    // If no auth options are specified, allow access
    if (
      !authOptions ||
      (authOptions.tenant === false && authOptions.identity === false)
    ) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    req.auth = {};

    if (authOptions.tenant) {
      await this.tryAuth(context, JWT_TENANT_ACCESS_STRATEGY, 'tenant');
    }
    if (authOptions.identity) {
      await this.tryAuth(context, JWT_IDENTITY_ACCESS_STRATEGY, 'identity');
    }

    const i18n = I18nContext.current();
    if (authOptions?.tenant && !req.auth.tenant)
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.TENANT_TOKEN_REQUIRED) ??
          'Tenant token required',
      );
    if (authOptions?.identity && !req.auth.identity)
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.IDENTITY_TOKEN_REQUIRED) ??
          'Identity token required',
      );

    await this.validateSessions(req, authOptions);
    return true;
  }

  private async validateSessions(
    req: {
      auth?: {
        identity?: { sessionId?: string };
        tenant?: { sessionId?: string };
      };
    },
    authOptions: { tenant?: boolean; identity?: boolean },
  ): Promise<void> {
    const i18n = I18nContext.current();
    const msg =
      i18n?.t(AuthI18n.errors.INVALID_REFRESH_TOKEN) ??
      'Session expired or invalid';

    const validate = async (sessionId: string, type: 'identity' | 'tenant') => {
      try {
        const exists =
          type === 'identity'
            ? await this.sessionService.identitySessionExists(sessionId)
            : await this.sessionService.tenantSessionExists(sessionId);
        if (!exists) {
          throw new UnauthorizedException(msg);
        }
        if (type === 'identity') {
          this.sessionService.touchIdentityActivity(sessionId);
        } else {
          this.sessionService.touchTenantActivity(sessionId);
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        this.logger.warn(
          `Redis unavailable, falling back to JWT-only validation: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    if (authOptions?.identity && req.auth?.identity) {
      const sid = req.auth.identity.sessionId;
      if (!sid) throw new UnauthorizedException(msg);
      await validate(sid, 'identity');
    }
    if (authOptions?.tenant && req.auth?.tenant) {
      const sid = req.auth.tenant.sessionId;
      if (!sid) throw new UnauthorizedException(msg);
      await validate(sid, 'tenant');
    }
  }

  private async tryAuth(
    context: ExecutionContext,
    strategy: string,
    key: 'tenant' | 'identity',
  ) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    return new Promise<void>((resolve) => {
      passport.authenticate(strategy, { session: false }, (err, user) => {
        if (err) {
          this.logger.warn(
            `JWT auth failed [${strategy}]: ${err instanceof Error ? err.message : String(err)}`,
          );
        } else if (user) {
          req.auth[key] = user;
        }
        resolve();
      })(req, res);
    });
  }
}
