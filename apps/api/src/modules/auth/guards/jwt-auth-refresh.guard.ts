import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import passport from 'passport';
import { AuthI18n } from '../constants/i18n.constants';
import { AUTH_REFRESH_OPTIONS_KEY } from '../decorators/auth-options.decorator';
import { SessionService } from '../services/session.service';
import {
  JWT_IDENTITY_REFRESH_STRATEGY,
  JWT_TENANT_REFRESH_STRATEGY,
} from '../strategies';
import { validateSessions } from '../utils/validate-sessions.util';

@Injectable()
export class JwtAuthRefreshGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthRefreshGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authOptions = this.reflector.getAllAndOverride<{
      tenant?: boolean;
      identity?: boolean;
    }>(AUTH_REFRESH_OPTIONS_KEY, [context.getHandler(), context.getClass()]);

    if (
      !authOptions ||
      (authOptions.tenant === false && authOptions.identity === false)
    ) {
      return false;
    }

    const req: {
      auth: {
        identity?: { sessionId?: string };
        tenant?: { sessionId?: string };
      };
    } = context.switchToHttp().getRequest();
    req.auth = {};

    if (authOptions.tenant) {
      await this.tryAuth(context, JWT_TENANT_REFRESH_STRATEGY, 'tenant');
    }
    if (authOptions.identity) {
      await this.tryAuth(context, JWT_IDENTITY_REFRESH_STRATEGY, 'identity');
    }

    const i18n = I18nContext.current();
    if (
      authOptions.tenant &&
      authOptions.identity &&
      !req.auth.tenant &&
      !req.auth.identity
    ) {
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.TENANT_OR_IDENTITY_REFRESH_TOKEN_REQUIRED) ??
          'Tenant or Identity refresh token is required',
      );
    } else if (
      authOptions.tenant &&
      !req.auth.tenant &&
      !authOptions.identity
    ) {
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.TENANT_REFRESH_TOKEN_REQUIRED) ??
          'Tenant refresh token required',
      );
    } else if (
      authOptions.identity &&
      !req.auth.identity &&
      !authOptions.tenant
    ) {
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.IDENTITY_REFRESH_TOKEN_REQUIRED) ??
          'Identity refresh token required',
      );
    }

    const strictMode =
      this.configService.get<boolean>('session.strictMode') ?? false;
    await validateSessions(this.sessionService, req, authOptions, strictMode);
    return true;
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
            `JWT refresh auth failed [${strategy}]: ${err instanceof Error ? err.message : String(err)}`,
          );
        } else if (user) {
          req.auth[key] = user;
        }
        resolve();
      })(req, res);
    });
  }
}
