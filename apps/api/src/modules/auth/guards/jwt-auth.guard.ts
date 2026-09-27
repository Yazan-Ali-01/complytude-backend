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
import { CommonI18n } from 'src/common/constants/i18n.constants';
import { AuthI18n } from '../constants/i18n.constants';
import {
  AUTH_OPTIONS_KEY,
  AUTH_REFRESH_OPTIONS_KEY,
  IS_PUBLIC_KEY,
} from '../decorators/auth-options.decorator';
import { SessionService } from '../services/session.service';
import {
  JWT_IDENTITY_ACCESS_STRATEGY,
  JWT_TENANT_ACCESS_STRATEGY,
} from '../strategies';
import { validateSessions } from '../utils/validate-sessions.util';

interface AuthTokenOptions {
  tenant?: boolean;
  identity?: boolean;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const authOptions = this.reflector.getAllAndOverride<
      AuthTokenOptions | undefined
    >(AUTH_OPTIONS_KEY, targets);

    if (!authOptions?.tenant && !authOptions?.identity) {
      if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
        return true;
      }
      // Refresh endpoints are authenticated by JwtAuthRefreshGuard.
      if (
        this.reflector.getAllAndOverride<AuthTokenOptions | undefined>(
          AUTH_REFRESH_OPTIONS_KEY,
          targets,
        )
      ) {
        return true;
      }
      this.logger.error(
        `Denied ${context.getClass().name}.${context.getHandler().name}: route has no @AuthOptions, @AuthRefreshOptions or @Public()`,
      );
      throw new UnauthorizedException(
        I18nContext.current()?.t(CommonI18n.errors.UNAUTHORIZED) ??
          'Unauthorized access',
      );
    }

    const req: {
      auth: {
        identity?: { sessionId?: string };
        tenant?: { sessionId?: string };
      };
    } = context.switchToHttp().getRequest();
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
